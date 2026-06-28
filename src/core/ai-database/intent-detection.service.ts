// src/core/ai-database/intent-detection.service.ts
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { IntentDetectionResult } from './interface/write-intent.interface';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { WriteOperation, WritePlan } from './dto/analysis-response.dto';
import { AI_DATABASE_PROJECT_CONFIG } from './ai-database.tokens';
import { AiDatabaseProjectConfig } from './interfaces/ai-database-project-config.interface';

type IntentClass = 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT';

@Injectable()
export class IntentDetectionService {
  private readonly logger = new Logger(IntentDetectionService.name);
  private readonly CACHE_TTL = 2 * 60 * 1000;
  private readonly classificationCache = new Map<string, { value: IntentClass; timestamp: number }>();
  private writeSchemaCache: { value: string; timestamp: number } | null = null;

  constructor(
    private readonly writeHandlerRegistry: WriteHandlerRegistry,
    @Optional() @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
  ) {}

  async detectIntent(
    question: string,
    llm: ChatOpenAI,
    readSchema: string,
    options: {
      forceWrite?: boolean;
      history?: string;
      plannerLlm?: ChatOpenAI;
      onLlmCall?: (info: { profile: 'fast' | 'quality'; input: unknown; modelName?: string }) => void;
      classifierModelName?: string;
      plannerModelName?: string;
    } = {},
  ): Promise<IntentDetectionResult> {

    // 1️⃣ Pré-filtre rapide : éviter un appel LLM pour les WRITE évidents
    const localClass = options.forceWrite ? 'WRITE' : this.classifyLocal(question);
    const isObviousWrite = options.forceWrite || localClass === 'WRITE';

    if (localClass === 'HELP') {
      return { type: 'HELP', requiresConfirmation: false };
    }

    if (localClass === 'ADVICE') {
      return { type: 'ADVICE', requiresConfirmation: false };
    }

    if (localClass === 'CHAT') {
      return { type: 'CONVERSATIONAL', requiresConfirmation: false };
    }

    if (localClass === 'READ') {
      return { type: 'READ', requiresConfirmation: false };
    }

    if (!isObviousWrite) {
      // 1b. Classification légère via LLM : READ | WRITE | CHAT
      //     (plus fiable que des heuristiques statiques)
      const lightClass = await this.lightClassify(question, llm, options);
      this.logger.log(`🏷️ Light classify → ${lightClass}`);

      if (lightClass === 'HELP') {
        return { type: 'HELP', requiresConfirmation: false };
      }

      if (lightClass === 'ADVICE') {
        return { type: 'ADVICE', requiresConfirmation: false };
      }

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

    const writeSchema = await this.getCachedWriteSchema();
    this.logger.log(`📝 Schéma d'écriture généré (${writeSchema.length} chars)`);

    // 3️⃣ Prompt amélioré pour les plans complexes
    const prompt = this.buildAdvancedDetectionPrompt(question, readSchema, writeSchema, options.history);
    
    try {
      const planner = options.plannerLlm ?? llm;
      const input = [{ role: 'user', content: prompt }];
      options.onLlmCall?.({ profile: 'quality', input, modelName: options.plannerModelName });
      const response = await planner.invoke(input);
      const content = response.content as string;
      
      this.logger.debug(`📥 Réponse LLM: ${content.substring(0, 500)}...`);
      
      const result = this.parseResponse(content);
      
      if (result.type === 'READ') {
        return { type: 'READ', requiresConfirmation: false };
      }

      if (result.type === 'HELP') {
        return { type: 'HELP', requiresConfirmation: false };
      }

      if (result.type === 'ADVICE') {
        return { type: 'ADVICE', requiresConfirmation: false };
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
  public classifyLocal(question: string): IntentClass | null {
    const normalized = this.normalizeText(question).trim();
    if (!normalized) return 'CHAT';

    if (this.isHelpIntent(question)) {
      return 'HELP';
    }

    if (this.isAdviceIntent(question)) {
      return 'ADVICE';
    }

    if (/^(bonjour|bonsoir|salut|hello|hi|merci|ok|d'accord|dac|ca va|ça va)[\s!.?]*$/.test(normalized)) {
      return 'CHAT';
    }

    const readPatterns = [
      /^(liste|lister|affiche|afficher|montre|montrer|cherche|chercher|trouve|trouver|combien|quels?|quelles?|qui|donne moi|donnez moi)\b/,
      /\b(nombre|total|statut|dossiers?|clients?|audiences?|factures?|paiements?|documents?)\b.*\?/,
    ];

    if (readPatterns.some(pattern => pattern.test(normalized))) {
      // Vérifier qu'un mot-clé du domaine métier est aussi présent.
      // Sans cela, "quel est la racine carree de 4" serait classé READ
      // car le pattern ^quels? matche toute question commençant par "quel".
      const domainKeywords = /\b(dossiers?|clients?|audiences?|factures?|paiements?|documents?|avocats?|diligences?|ecritures?|comptes?|journa(?:l|ux)|exercices?|salaires?|employes?|procedures?|etapes?|chiffre|montant|encaiss|impay|regl|honoraires?|stage|savings?|loan|customer|employee)\b/;
      if (domainKeywords.test(normalized)) {
        return 'READ';
      }
      // Pas de mot-clé métier → laisser le LLM classifier (question générale probable)
    }

    if (this.isWriteIntent(question)) {
      return 'WRITE';
    }

    return null;
  }

  private async getCachedWriteSchema(): Promise<string> {
    const now = Date.now();
    if (this.writeSchemaCache && now - this.writeSchemaCache.timestamp < this.CACHE_TTL) {
      return this.writeSchemaCache.value;
    }
    const value = await this.writeHandlerRegistry.generateGlobalWriteSchema();
    this.writeSchemaCache = { value, timestamp: now };
    return value;
  }

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
- Si l'utilisateur demande comment faire, où cliquer, ou une procédure à suivre → { "type": "HELP" }
- Si l'utilisateur demande un conseil, une recommandation, quoi ajouter, quoi améliorer, ou une suggestion basée sur le contexte → { "type": "ADVICE" }
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
Pour un CONSEIL:
{"type": "ADVICE"}
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
  private isHelpIntent(question: string): boolean {
    const normalized = this.normalizeText(question);
    const patterns = [
      /comment\s+(?:faire|creer|ajouter|modifier|supprimer)/,
      /ou\s+cliquer/,
      /explique.*(?:creer|ajouter|modifier|supprimer)/,
      /procedure\s+pour/,
      /guide\s+pour/,
    ];

    return patterns.some(pattern => pattern.test(normalized));
  }

  private isAdviceIntent(question: string): boolean {
    const normalized = this.normalizeText(question);
    const patterns = [
      /\bconseil(?:le|ler|s)?\b/,
      /\brecommand(?:e|er|ation|ations)\b/,
      /\bsuggestions?\b/,
      /\bproposes?\b/,
      /\bidees?\b/,
      /\bquoi\s+ajouter\b/,
      /\bque\s+(?:peux|peut|pourrais|pourrait)[-\s]*tu\s+me\s+conseil/,
      /\bque\s+(?:me\s+)?(?:conseilles?|recommandes?)[-\s]*tu\b/,
      /\bque\s+manque\b/,
      /\bqu(?:e|oi)\s+(?:ameliorer|optimiser)\b/,
      /\b(?:ajouter|ajjouter)\s+encore\b/,
      /\bprochaine?s?\s+etapes?\b/,
    ];

    return patterns.some(pattern => pattern.test(normalized));
  }

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
  private async lightClassify(
    question: string,
    llm: ChatOpenAI,
    options: {
      onLlmCall?: (info: { profile: 'fast' | 'quality'; input: unknown; modelName?: string }) => void;
      classifierModelName?: string;
    } = {},
  ): Promise<IntentClass> {
    const cacheKey = this.normalizeText(question).trim();
    const cached = this.classificationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }

    const prompt = `Tu es un classificateur pour un assistant IA de cabinet d'avocats.
Classe la demande suivante en UN SEUL MOT parmi : READ, WRITE, HELP, ADVICE, CHAT.

READ   = interroger des données existantes (lister, chercher, afficher, compter, montrer, combien, quels, qui, quel dossier...)
WRITE  = créer, modifier ou supprimer des données (créer, ajouter, enregistrer, ouvrir un dossier, modifier, supprimer, AINSI QUE les opérations comptables : passer/saisir/comptabiliser une écriture, débiter, créditer, créer un compte ou un journal, ouvrir/clôturer un exercice...)
HELP   = expliquer comment utiliser l'application, ou guider l'utilisateur dans une procédure (comment faire, comment créer, où cliquer, procédure pour, guide pour). Une demande "comment créer..." est HELP, pas WRITE.
ADVICE = donner des conseils, recommandations, suggestions, pistes d'amélioration ou prochaines étapes, souvent à partir du contexte précédent. Une demande "que peux-tu me conseiller d'ajouter encore ?" est ADVICE, pas READ.
CHAT   = question générale sans lien avec les données du cabinet (salutation, remerciement, question de culture générale, demande d'explication hors-métier...)

Contexte du cabinet : dossiers juridiques, clients, avocats, factures, audiences, paiements, diligences, ET comptabilité (écritures comptables, comptes du plan comptable, journaux, exercices).
⚠️ « passer une écriture », « comptabiliser », « saisir une écriture » sont des opérations WRITE (création d'une écriture comptable), jamais READ.

Demande : "${question.replace(/"/g, "'")}"

Réponds UNIQUEMENT avec READ, WRITE, HELP, ADVICE ou CHAT. Rien d'autre.`;

    try {
      const input = [{ role: 'user', content: prompt }];
      options.onLlmCall?.({ profile: 'fast', input, modelName: options.classifierModelName });
      const response = await llm.invoke(input);
      const raw = (response.content as string).trim().toUpperCase().replace(/[^A-Z]/g, '');
      const value: IntentClass = raw.startsWith('WRITE')
        ? 'WRITE'
        : raw.startsWith('HELP')
          ? 'HELP'
        : raw.startsWith('ADVICE')
          ? 'ADVICE'
        : raw.startsWith('CHAT')
          ? 'CHAT'
          : 'READ';
      this.classificationCache.set(cacheKey, { value, timestamp: Date.now() });
      return value;
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
