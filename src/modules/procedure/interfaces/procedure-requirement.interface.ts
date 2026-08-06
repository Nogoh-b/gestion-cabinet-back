export enum ProcedureRequirementType {
  DOCUMENT_ACCEPTED = 'DOCUMENT_ACCEPTED',
  AUDIENCE_HELD = 'AUDIENCE_HELD',
  DILIGENCE_COMPLETED = 'DILIGENCE_COMPLETED',
  TASK_COMPLETED = 'TASK_COMPLETED',
  INVOICE_ISSUED = 'INVOICE_ISSUED',
  INVOICE_PAID = 'INVOICE_PAID',
  DECISION_VALIDATED = 'DECISION_VALIDATED',
  FIELD_REQUIRED = 'FIELD_REQUIRED',
  APPROVAL = 'APPROVAL',
}

export interface ProcedureRequirement {
  id: string;
  type: ProcedureRequirementType;
  label?: string;
  documentTypeId?: number;
  taskId?: string;
  field?: string;
  approvalCount?: number;
  approvalRole?: string;
}

export interface ProcedureRequirementResult {
  id: string;
  type: ProcedureRequirementType | 'SUB_STAGE_COMPLETED';
  label: string;
  satisfied: boolean;
  subStageId?: string;
  subStageName?: string;
  details?: Record<string, any>;
}
