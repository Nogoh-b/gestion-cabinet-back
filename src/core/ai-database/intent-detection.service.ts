import { Injectable } from "@nestjs/common";
import { ChatOpenAI } from "node_modules/@langchain/openai/dist";
import { IntentDetectionResult, WriteIntent } from "./interface/write-intent.interface";

// intent-detection.service.ts
@Injectable()
export class IntentDetectionService {
  private readonly WRITE_KEYWORDS = [
    'crée', 'créer', 'ajouter', 'nouveau', 'nouvelle',
    'modifie', 'modifier', 'mettre à jour', 'changer',
    'supprime', 'supprimer', 'ferme', 'clôture', 'archive',
    'enregistre', 'ouvre', 'assigne', 'change le statut'
  ];

  isWriteIntent(question: string): boolean {
    const lower = question.toLowerCase();
    return this.WRITE_KEYWORDS.some(kw => lower.includes(kw));
  }

  async detectIntent(
    question: string,
    llm: ChatOpenAI,
    schema: string
  ): Promise<IntentDetectionResult> {
    
    if (!this.isWriteIntent(question)) {
      return { type: 'READ', requiresConfirmation: false };
    }

    // Demander au LLM de structurer l'intention en JSON
    const prompt = `Tu es un assistant qui analyse des demandes utilisateur pour une base de données juridique.

Schéma disponible:
${schema}

Question de l'utilisateur: "${question}"

Analyse cette demande et réponds UNIQUEMENT avec un JSON structuré:

{
  "operation": "INSERT" | "UPDATE" | "DELETE",
  "entity": "nom_de_la_table",
  "entityId": null | 123 | "uuid",
  "fields": {
    "champ1": "valeur1",
    "champ2": "valeur2"
  },
  "confidence": 0.95,
  "humanReadable": "Créer un nouveau dossier pour le client X avec le statut Y"
}

RÈGLES:
- entity doit être un nom de table valide du schéma
- fields ne doit contenir QUE les champs mentionnés explicitement
- confidence entre 0 et 1 (1 = certitude absolue)
- humanReadable en français, phrase claire de confirmation

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = response.content as string;

    try {
      const clean = content.replace(/```json|```/g, '').trim();
      const intent: WriteIntent = JSON.parse(clean);
      
      return {
        type: 'WRITE',
        writeIntent: intent,
        // Toujours demander confirmation pour les écritures
        requiresConfirmation: intent.confidence < 0.95 || 
                               intent.operation === 'DELETE',
      };
    } catch {
      // Si parsing échoue, fallback en READ
      return { type: 'READ', requiresConfirmation: false };
    }
  }
}