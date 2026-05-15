// src/modules/ai/intent-detection/intent-detection.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { IntentDetectionResult } from './interface/write-intent.interface';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { WriteOperation, WritePlan } from './dto/analysis-response.dto';

@Injectable()
export class IntentDetectionService {
  private readonly logger = new Logger(IntentDetectionService.name);
  
  constructor(private readonly writeHandlerRegistry: WriteHandlerRegistry) {}

  async detectIntent(
    question: string,
    llm: ChatOpenAI,
    readSchema: string,
  ): Promise<IntentDetectionResult> {
    
    // 1️⃣ Vérification rapide par mots-clés
    if (!this.isWriteIntent(question)) {
      return { type: 'READ', requiresConfirmation: false };
    }

    // 2️⃣ Générer le schéma d'écriture
    const handlers = this.writeHandlerRegistry.getAllHandlers();
    this.logger.log(`📝 Handlers enregistrés: ${handlers.length} → [${handlers.map(h => h.entityName).join(', ')}]`);

    const writeSchema = await this.writeHandlerRegistry.generateGlobalWriteSchema();
    this.logger.log(`📝 Schéma d'écriture généré (${writeSchema.length} chars)`);

    // 3️⃣ Prompt amélioré pour les plans complexes
    const prompt = this.buildAdvancedDetectionPrompt(question, readSchema, writeSchema);
    
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
  private buildAdvancedDetectionPrompt(question: string, readSchema: string, writeSchema: string): string {
    return `Tu es un expert en analyse de demandes pour une base de données juridique.

## 🧠 RÉFLEXION
Avant de répondre, analyse soigneusement :
1. Quelle est l'intention EXACTE de l'utilisateur ?
2. Quelles entités sont impliquées ?
3. Y a-t-il des dépendances entre les entités (ex: dossier nécessite un client) ?
4. Quels champs sont fournis explicitement et lesquels doivent être déduits ?
5. La confiance est-elle suffisante pour exécuter directement ?

## 📖 SCHÉMA DE LECTURE (pour comprendre les relations)
${readSchema.substring(0, 3000)}

## 📝 ENTITÉS MODIFIABLES
${writeSchema}

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

### 5. 🏛️ Règle CRITIQUE pour les DOSSIERS
Quand tu crées un dossier, tu DOIS OBLIGATOIREMENT inclure :
- **procedure_type** : le type de procédure (ex: "Contentieux civil", "Droit de la famille", "Droit des affaires", "Droit des étrangers")
- **procedure_subtype** : le sous-type de procédure (ex: "Divorce", "Rupture conventionnelle", "Recouvrement", "Refus de titre de séjour")

Ces deux champs sont OBLIGATOIRES. Si l'utilisateur mentionne "divorce", "contentieux",
"recouvrement", "civil", etc., déduis le type et sous-type de procédure correspondants.

### 6. 🔄 Résolution des ambiguïtés (optionnel)
Si l'utilisateur dit "prends le plus probable" ou "je ne sais plus lequel",
ajoute ceci dans l'opération concernée (dans le JSON du plan) :
"resolveConfig": { "mode": "best_effort" }
Cela permettra de prendre automatiquement la meilleure correspondance en cas d'homonymie.

### 7. 💰 Règle CRITIQUE pour les DONNÉES FINANCIÈRES
Quand des données financières sont présentes dans le texte (honoraires, provisions, factures, paiements),
tu DOIS créer les entités correspondantes APRÈS le dossier.

**Mots déclencheurs à détecter** :
"honoraires", "provision", "forfait", "HT", "TTC", "€", "euros", "réglé", "payé",
"acompte", "solde", "facture", "paiement", "virement", "chèque".

**Règles de création** :
- **Facture** → INSERT dans l'entite "factures" avec :
  - champ "montantHT" : montant HT en nombre (ex: 1800.00)
  - champ "type" : 0=HONORAIRES (honoraires/forfait), 1=FRAIS_PROCEDURE, 2=DILIGENCES
  - champ "description" : objet de la facture (ex: "Forfait recours gracieux + contentieux")
  - champ "status" : 2=PARTIELLEMENT_PAYEE si provision reçue, 1=ENVOYEE sinon, 3=PAYEE si tout réglé
  - Référence le dossier et le client via tempId

- **Paiement** → INSERT dans l'entite "paiements" APRÈS la facture correspondante avec :
  - champ "montant" : montant payé en nombre (ex: 900.00)
  - champ "datePaiement" : date du paiement si mentionnée (format YYYY-MM-DD), sinon "{{today}}"
  - champ "modePaiement" : 0=VIREMENT (défaut), 1=CHEQUE, 2=ESPECES, 3=CARTE
  - champ "status" : 1=VALIDE si paiement déjà effectué
  - Référence la facture via tempId

**Exemple de plan financier** :
  { "operation": "INSERT", "entity": "factures", "tempId": "facture_1",
    "fields": { "montantHT": 1800.00, "type": "0", "description": "Forfait recours gracieux + contentieux",
                "status": "2", "dossier": "{{new_dossier.id}}", "client": "{{new_client.id}}" } },
  { "operation": "INSERT", "entity": "paiements", "tempId": "paiement_1",
    "fields": { "montant": 900.00, "datePaiement": "2026-04-15", "modePaiement": "0",
                "status": "1", "facture": "{{facture_1.id}}" } }

### 8. 🗓️ Règle pour les AUDIENCES ET ÉCHÉANCES PROCÉDURALES
Quand des dates de procédure, audiences, délais légaux ou échéances sont mentionnés,
crée des entités "audiences" correspondantes APRÈS le dossier.

**Mots déclencheurs à détecter** :
"audience", "jugement", "délibération", "plaidoirie", "délai", "échéance", "rejet implicite",
"convocation", "comparution", "conciliation", "rendez-vous tribunal".

**Règles de création** :
- INSERT dans l'entité "audiences" avec :
  - champ "audience_date" : date au format YYYY-MM-DD
  - champ "audience_time" : heure si mentionnée, sinon "09:00"
  - champ "type" : 0=Plaidoirie (défaut), 1=Délibération, 2=Jugement, 3=Conciliation
  - champ "status" : 0=Programmée (défaut)
  - champ "notes" : contexte (ex: "Délai de réponse au recours gracieux")
  - Référence le dossier via tempId

## 📤 FORMAT DE RÉPONSE JSON UNIQUEMENT

Pour une LECTURE:
{"type": "READ"}

Pour une CRÉATION MULTI-ENTITÉS (avec finances et audiences) :
{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      {
        "operation": "INSERT",
        "entity": "customer",
        "tempId": "new_client",
        "fields": {
          "first_name": "Amir",
          "last_name": "Ziani",
          "email": "amir.ziani@gmail.com",
          "phone": "0712345678"
        }
      },
      {
        "operation": "INSERT",
        "entity": "dossiers",
        "tempId": "new_dossier",
        "fields": {
          "client": "{{new_client.id}}",
          "object": "Recours contre refus de renouvellement de titre de séjour Salarié",
          "lawyer": "Nom Avocat",
          "procedure_type": "Droit des étrangers",
          "procedure_subtype": "Refus de titre de séjour",
          "opposing_party_name": "Préfecture du Rhône",
          "priority_level": 2
        }
      },
      {
        "operation": "INSERT",
        "entity": "factures",
        "tempId": "facture_honoraires",
        "fields": {
          "dossier": "{{new_dossier.id}}",
          "client": "{{new_client.id}}",
          "montantHT": 1800.00,
          "type": "0",
          "description": "Forfait recours gracieux + contentieux",
          "status": "2"
        }
      },
      {
        "operation": "INSERT",
        "entity": "paiements",
        "tempId": "paiement_provision",
        "fields": {
          "facture": "{{facture_honoraires.id}}",
          "montant": 900.00,
          "datePaiement": "2026-04-15",
          "modePaiement": "0",
          "status": "1"
        }
      },
      {
        "operation": "INSERT",
        "entity": "audiences",
        "tempId": "echeance_rejet",
        "fields": {
          "dossier": "{{new_dossier.id}}",
          "audience_date": "2026-06-22",
          "audience_time": "09:00",
          "type": "0",
          "status": "0",
          "notes": "Délai de réponse au recours gracieux — silence vaut rejet implicite"
        }
      }
    ],
    "humanReadable": "Créer le client, le dossier, la facture d'honoraires (1800€ HT), la provision reçue (900€) et l'échéance du recours gracieux",
    "confidence": 0.92
  }
}

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
        entityId: op.entityId || null,
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