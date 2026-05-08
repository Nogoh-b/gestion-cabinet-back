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
}

export interface IntentDetectionResult {
  type: 'READ' | 'WRITE';
  writeIntent?: WriteIntent;
  writePlan?: WritePlan;
  sqlQuery?: string;        // Si READ
  requiresConfirmation: boolean;
}