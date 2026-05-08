export class AnalysisResponseDto {
  success: boolean = true;
  question: string = '';
  sqlQuery?: string;
  schema?: any;
  schemaJSON?: any;
  rawResults?: any[];
  analysis: string = '';
  tokensUsed?: number;
  results?: any;
  pendingWrite?: any;
  requiresConfirmation?: boolean;
  conversationId?: any;
  rowCount?: any;
  executionTimeMs: number = 1;
  recommendations?: string[];
  error?: string;
  pendingWritePlan?: WritePlan;  // ← Nouveau
}

export interface WritePlan {
  transaction: boolean;
  operations: WriteOperation[];
  humanReadable: string;
  confidence: number;
}

export interface WriteOperation {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId?: string | number;
  fields: Record<string, any>;
  tempId?: string;
  dependsOn?: string[];
  humanReadable: string;    // Description lisible pour confirmation

}