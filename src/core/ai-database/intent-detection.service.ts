// src/core/ai-database/intent-detection.service.ts
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { IntentDetectionResult } from './interface/write-intent.interface';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { WriteOperation, WritePlan } from './dto/analysis-response.dto';
import { AI_DATABASE_PROJECT_CONFIG } from './ai-database.tokens';
import { AiDatabaseProjectConfig } from './interfaces/ai-database-project-config.interface';

@Injectable()
export class IntentDetectionService {
  private readonly logger = new Logger(IntentDetectionService.name);

  constructor(
    private readonly writeHandlerRegistry: WriteHandlerRegistry,
    @Optional() @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
  ) {}

  async detectIntent(
    question: string,
    llm: ChatOpenAI,
    readSchema: string,
    options: { forceWrite?: boolean; history?: string } = {},
  ): Promise<IntentDetectionResult> {

    // 1️⃣ Pré-filtre rapide : éviter un appel LLM pour les WRITE évidents
    const isObviousWrite = options.forceWrite || this.isWriteIntent(question);

    if (!isObviousWrite) {
      // 1b. Classification légère via LLM : READ | WRITE | CHAT
      //     (plus fiable que des heuristiques statiques)
      const lightClass = await this.lightClassify(question, llm);
      this.logger.log(`🏷️ Light classify → ${lightClass}`);

      if (lightClass === 'CHAT') {
        // Ne pas pré-générer la réponse ici (appel bloquant).
        // analyzeQuestionStream() streamera la réponse directement via llm.stream().
        return { type: 'CONVERSATIONAL', requiresConfirmation: false };
      }
      if (lightClass === 'READ') {
        return { type: 'READ', requiresConfirmation: false };
      }
      // lightClass === 'WRITE' → on laisse tomber dans la branche WRITE ci-dessous
    }

    // 2️⃣ Générer le schéma d'écriture
    const handlers = this.writeHandlerRegistry.getAllHandlers();
    this.logger.log(`📝 Handlers enregistrés: ${handlers.length} → [${handlers.map(h => h.entityName).join(', ')}]`);

    const writeSchema = await this.writeHandlerRegistry.generateGlobalWriteSchema();
    this.logger.log(`📝 Schéma d'écriture généré (${writeSchema.length} chars)`);

    // 3️⃣ Prompt amélioré pour les plans complexes
    const prompt = this.buildAdvancedDetectionPrompt(question, readSchema, writeSchema, options.history);
    
    try {
      const response = await llm.invoke([{ role: 'user', content: prompt }]);
      const content = response.content as string;
      
      this.logger.debug(`📥 Réponse LLM: ${content.substring(0, 500)}...`);
      
      const result = this.parseResponse(content);
      
      if (result.type === 'READ') {
        return { type: 'READ', requiresConfirmation: false };
      }
      
      // Valider et enrichir le plan
      const validatedPlan = this.validateAndEnrichPlan(result.writePlan);
      
      const requiresConfirmation = validatedPlan.confidence < 0.85 || 
                                    validatedPlan.operations.length > 1 ||
                                    validatedPlan.operations.some(op => op.operation === 'DELETE');
      
      return {
        type: 'WRITE',
        writePlan: validatedPlan,
        requiresConfirmation,
      };
      
    } catch (error) {
      this.logger.error(`❌ Erreur: ${error.message}`);
      return { type: 'READ', requiresConfirmation: false };
    }
  }

  /**
   * Prompt avancé pour la détection multi-opérations
   */
  private buildAdvancedDetectionPrompt(question: string, readSchema: string, writeSchema: string, history?: string): string {
    const genericWriteExample = `{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      { "operation": "INSERT", "entity": "customer", "tempId": "new_client",
        "fields": { "first_name": "Jean", "last_name": "Dupont", "email": "jean@example.com" } }
    ],
    "humanReadable": "Créer le client Jean Dupont",
    "confidence": 0.95
  }
}`;

    return `Tu es un expert en analyse de demandes pour une base de données.

## 🧠 RÉFLEXION
Avant de répondre, analyse soigneusement :
1. Quelle est l'intention EXACTE de l'utilisateur ?
2. Quelles entités sont impliquées ?
3. Y a-t-il des dépendances entre les entités (ex: dossier nécessite un client) ?
4. Quels champs sont fournis explicitement et lesquels doivent être déduits ?
5. La confiance est-elle suffisante pour exécuter directement ?

## 📖 SCHÉMA DE LECTURE (pour comprendre les relations)
${readSchema.substring(0, 10000)}

## 📝 ENTITÉS MODIFIABLES
${writeSchema}
${history ? `\n## 🗨️ HISTORIQUE RÉCENT DE LA CONVERSATION (le plus ancien en premier)\n${history}\n` : ''}
## ❓ DEMANDE UTILISATEUR
"${question}"

## 🎯 OBJECTIF
Décomposer cette demande en un PLAN d'opérations.
- Si c'est une simple lecture → { "type": "READ" }
- Si c'est une création/modification → génère un plan avec les dépendances

## ⚠️ RÈGLES CRITIQUES

### 1. Ordre des opérations
- Les opérations DOIVENT être dans l'ordre des dépendances
- Crée d'abord les entités référencées (ex: client avant dossier)
- Pour chaque entité qui sera référencée, utilise un "tempId"

### 2. Résolution des références
- Utilise "{{tempId.id}}" pour référencer l'ID d'une entité créée
- Exemple: "client_id": "{{new_customer.id}}"

### 3. Champs acceptés
- N'utilise que les champs listés dans "ENTITÉS MODIFIABLES"
- Les noms de champs doivent être exacts
- Pour les références (client, lawyer), tu PEUX utiliser le NOM (sera résolu automatiquement)

### 4. Valeurs spéciales
- "{{today}}" → date du jour
- "{{now}}" → timestamp actuel

### 6. 🔄 Résolution des ambiguïtés (optionnel)
Si l'utilisateur dit "prends le plus probable" ou "je ne sais plus lequel",
ajoute ceci dans l'opération concernée (dans le JSON du plan) :
"resolveConfig": { "mode": "best_effort" }
Cela permettra de prendre automatiquement la meilleure correspondance en cas d'homonymie.

### 7. 🎯 Référence implicite à une entité déjà évoquée (TRÈS IMPORTANT)
Si l'utilisateur utilise un pronom ou une référence implicite ("la", "le", "celui-ci",
"cette audience", "ce dossier"...) SANS redonner l'identifiant, regarde
l'HISTORIQUE RÉCENT ci-dessus : si un message précédent (utilisateur ou assistant)
mentionne explicitement un identifiant numérique (ex: "ID: 42", "audience n°42",
"#42") pour une entité du MÊME TYPE que celle visée par la demande, RÉUTILISE cet ID
comme "entityId" de l'opération UPDATE/DELETE.
N'invente JAMAIS un ID : si aucun identifiant exploitable n'apparaît dans l'historique
ni dans la demande, NE METS PAS "entityId" (laisse-le absent) plutôt que de deviner —
le système redemandera alors une précision à l'utilisateur.
${this.projectConfig?.promptDomainRules ? `\n${this.projectConfig.promptDomainRules}\n` : ''}
## 📤 FORMAT DE RÉPONSE JSON UNIQUEMENT

Pour une LECTURE:
{"type": "READ"}
${this.projectConfig?.promptDomainExample ? `\nPour une CRÉATION MULTI-ENTITÉS:\n${this.projectConfig.promptDomainExample}\n` : `\nPour une CRÉATION:\n${genericWriteExample}\n`}
Pour une MODIFICATION:
{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      {
        "operation": "UPDATE",
        "entity": "dossiers",
        "entityId": 123,
        "fields": {
          "status": "3",
          "priority_level": 2
        }
      }
    ],
    "humanReadable": "Changer le statut du dossier 123",
    "confidence": 0.95
  }
}

## 🚨 IMPORTANT
- Les noms de clients/avocats seront automatiquement résolus en IDs
- Il n'est PAS nécessaire de connaître les IDs à l'avance
- Le système cherchera les correspondances ou créera les entités si nécessaire

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
  }

  /**
   * Valide et enrichit le plan
   */
  private validateAndEnrichPlan(plan: any): WritePlan {
    if (!plan.operations || !Array.isArray(plan.operations)) {
      throw new Error('Plan invalide: operations manquantes');
    }

    // Enrichir chaque opération
    const enrichedOperations: WriteOperation[] = plan.operations.map((op: any, index: number) => {
      // Nettoyer les champs
      const cleanedFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(op.fields || {})) {
        // Nettoyer les valeurs
        if (typeof value === 'string') {
          cleanedFields[key] = value.trim();
        } else {
          cleanedFields[key] = value;
        }
      }

            return {
        operation: op.operation,
        entity: op.entity.toLowerCase(),
        entityId: op.entityId ?? op.fields?.id ?? op.fields?.entityId ?? null,
        fields: cleanedFields,
        tempId: op.tempId || `op_${index}`,
        dependsOn: op.dependsOn || [],
        // ✅ Préserver resolveConfig si fourni par le LLM
        resolveConfig: op.resolveConfig || undefined,
      };
    });

    return {
      transaction: plan.transaction !== false, // true par défaut
      operations: enrichedOperations,
      humanReadable: plan.humanReadable || `Exécution de ${enrichedOperations.length} opération(s)`,
      confidence: Math.min(plan.confidence || 0.8, 1),
    };
  }

  /**
   * Détection par mots-clés améliorée.
   *
   * ⚠️ IMPORTANT : Les mots-clés sont DÉJÀ normalisés (sans accents)
   * car normalizeText() supprime les accents du texte d'entrée.
   * Il faut comparer des pommes avec des pommes.
   */
  private isWriteIntent(question: string): boolean {
    const normalized = this.normalizeText(question);

    // ✅ Mots-clés SANS accents (car normalizeText supprime les accents)
    const strongWriteKeywords = [
      'cree', 'creer', 'creation', 'nouveau', 'nouvelle',
      'ajoute', 'ajouter', 'ajout', 'ajoute',
      'modifie', 'modifier', 'modification', 'modifie',
      'supprime', 'supprimer', 'suppression', 'supprime',
      'enregistre', 'enregistrer', 'enregistre',
      'ouvre', 'ouvrir', 'ouvert',
      'ferme', 'fermer', 'ferme',
      'archive', 'archiver', 'archive',
      'cloture', 'cloturer', 'cloture',
      'assigne', 'assigner', 'assigne',
      'attribue', 'attribuer', 'attribue',
      'mettre a jour', 'mise a jour', 'met a jour',
      'changer', 'change',
      'inserer', 'insere', 'insertion',
      // Vocabulaire comptable (création/modification d'écritures, comptes, journaux…)
      'comptabilise', 'comptabiliser',
      'passe une ecriture', 'passer une ecriture', 'passe ecriture', 'saisis une ecriture', 'saisir une ecriture',
      'saisis', 'saisir', 'saisie',
      'debite', 'debiter', 'crediter', 'credite',
      'lettrer', 'lettrage', 'rapproche', 'rapprocher',
    ];

    for (const keyword of strongWriteKeywords) {
      if (normalized.includes(keyword)) {
        this.logger.debug(`🔍 Mot-clé WRITE détecté: "${keyword}" dans "${normalized.substring(0, 60)}..."`);
        return true;
      }
    }

    // ✅ Patterns avancés (testés sur le texte NORMALISÉ, sans accents)
    const patterns = [
      /je\s+(?:veux|souhaite|voudrais)\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /peux-tu\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /pourrais-tu\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /j'aimerais\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /il\s+faut\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /(?:merci de|veuillez)\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      // Patterns d'analyse structurée avec données brutes → intent WRITE implicite
      /cree\s+un\s+dossier/,
      /dossier\s+(?:client|juridique|structure)/,
      /INSTRUCTION\s*:/i,
      /DONNEES\s+BRUTES/i,
      /fiche\s+(?:client|de\s+synthese|synthetique)/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        this.logger.debug(`🔍 Pattern WRITE détecté: ${pattern}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Classification légère via LLM.
   *
   * Un seul appel court (prompt ~300 tokens, réponse 1 mot) qui distingue
   * READ / WRITE / CHAT de façon fiable, sans avoir besoin de heuristiques fragiles.
   *
   * Appelé uniquement quand `isWriteIntent()` n'a pas trouvé de mots-clés évidents,
   * donc pas de surcoût pour les WRITE évidents.
   */
  private async lightClassify(question: string, llm: ChatOpenAI): Promise<'READ' | 'WRITE' | 'CHAT'> {
    const prompt = `Tu es un classificateur pour un assistant IA de cabinet d'avocats.
Classe la demande suivante en UN SEUL MOT parmi : READ, WRITE, CHAT.

READ   = interroger des données existantes (lister, chercher, afficher, compter, montrer, combien, quels, qui, quel dossier...)
WRITE  = créer, modifier ou supprimer des données (créer, ajouter, enregistrer, ouvrir un dossier, modifier, supprimer, AINSI QUE les opérations comptables : passer/saisir/comptabiliser une écriture, débiter, créditer, créer un compte ou un journal, ouvrir/clôturer un exercice...)
CHAT   = question générale sans lien avec les données du cabinet (salutation, remerciement, question de culture générale, demande d'explication hors-métier...)

Contexte du cabinet : dossiers juridiques, clients, avocats, factures, audiences, paiements, diligences, ET comptabilité (écritures comptables, comptes du plan comptable, journaux, exercices).
⚠️ « passer une écriture », « comptabiliser », « saisir une écriture » sont des opérations WRITE (création d'une écriture comptable), jamais READ.

Demande : "${question.replace(/"/g, "'")}"

Réponds UNIQUEMENT avec READ, WRITE ou CHAT. Rien d'autre.`;

    try {
      const response = await llm.invoke([{ role: 'user', content: prompt }]);
      const raw = (response.content as string).trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (raw.startsWith('WRITE')) return 'WRITE';
      if (raw.startsWith('CHAT')) return 'CHAT';
      return 'READ'; // défaut sûr : on essaie le SQL
    } catch {
      return 'READ'; // en cas d'erreur, on tente le SQL
    }
  }

  /**
   * Génère une réponse directe pour les questions conversationnelles.
   * Le prompt système est fourni par projectConfig.conversationalSystemPrompt (logique métier externe).
   * Un prompt générique est utilisé si aucune config n'est fournie.
   */
  private async generateConversationalResponse(question: string, llm: ChatOpenAI): Promise<string> {
    const systemPrompt = this.projectConfig?.conversationalSystemPrompt
      ?? `Tu es un assistant IA. Réponds aux questions générales et aux salutations de façon courtoise et professionnelle.`;

    try {
      const response = await llm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ]);
      return response.content as string;
    } catch {
      return `Bonjour ! Comment puis-je vous aider ?`;
    }
  }

  /**
   * Normalise le texte (minuscules, sans accents)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae');
  }

  /**
   * Parse la réponse JSON
   */
  private parseResponse(content: string): any {
    // Nettoyer le contenu
    let clean = content.trim();
    
    // Enlever les balises code
    clean = clean.replace(/```json\s*/g, '');
    clean = clean.replace(/```\s*/g, '');
    
    // Extraire le JSON (au cas où il y aurait du texte autour)
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }
    
    return JSON.parse(clean);
  }
}
