export class AnalysisResponseDto {
  success: boolean;
  question: string;
  sqlQuery?: string;
  rawResults?: any[];
  analysis: string;
  tokensUsed?: number;
  executionTimeMs: number;
  recommendations?: string[];
  error?: string;
}