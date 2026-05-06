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
  conversationId?: any;
  rowCount?: any;
  executionTimeMs: number = 1;
  recommendations?: string[];
  error?: string;
}