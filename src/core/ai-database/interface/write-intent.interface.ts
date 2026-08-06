// interface/write-intent.interface.ts

import { WritePlan } from "../dto/analysis-response.dto";

export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE' | 'READ';

export interface WriteIntent {
  operation: OperationType;
  entity: string;           // 'dossier', 'customer', 'employee'...
  tempId?: any;           // 'dossier', 'customer', 'employee'...
  entityId?: string | number; // Pour UPDATE/DELETE
  fields: Record<string, any>; // Les champs à modifier
  confidence: number;       // 0-1, score de confiance du LLM
  humanReadable: string;    // Description lisible pour confirmation
  /**
   * Configuration de résolution des dépendances (FK).
   * Permet de contrôler le comportement en cas d'ambiguïté.
   * Si non fourni, le mode STRICT est utilisé (comportement actuel).
   */
  resolveConfig?: {
    mode?: 'strict' | 'best_effort';
    minScore?: number;
    ambiguityGap?: number;
  };
  /**
   * QueryRunner optionnel pour participer à une transaction.
   * Si fourni, le handler utilisera queryRunner.manager.save() au lieu de repo.save()
   * pour que les opérations du handler soient atomiques avec le reste du plan.
   */
  queryRunner?: import('typeorm').QueryRunner;
}

export interface IntentDetectionResult {
  /** READ = interrogation BD, WRITE = écriture BD, CONVERSATIONAL = réponse directe sans SQL */
  type: 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CONVERSATIONAL' | 'DOCUMENT' | 'TEXT';
  writeIntent?: WriteIntent;
  writePlan?: WritePlan;
  sqlQuery?: string;        // Si READ
  requiresConfirmation: boolean;
  /** Réponse directe de l'IA (mode CONVERSATIONAL uniquement) */
  conversationalResponse?: string;
}
