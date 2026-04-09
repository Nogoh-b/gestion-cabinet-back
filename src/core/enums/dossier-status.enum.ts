// src/common/enums/dossier_status.enum.ts
export enum DossierStatus {
  OPEN = 0,
  PRELIMINARY_ANALYSIS = 1,
  AMICABLE = 2,
  LITIGATION = 3,
  JUDGMENT = 4,
  APPEAL = 5,
  CASSATION = 6,
  EXECUTION = 7,
  CLOSED = 8,
  ARCHIVED = 9,
  ABANDONED = 10
}
// src/core/enums/client-decision.enum.ts
export enum ClientDecision {
  TRANSACTION = 'transaction',
  CONTENTIEUX = 'contentieux',
  ABANDON = 'abandon'
}

// src/core/enums/recommendation-type.enum.ts
export enum RecommendationType {
  TRANSACTION = 'transaction',           // Recommander transaction
  PRESENT_OPTIONS = 'present_options',   // Présenter les options
  PROCEDURE = 'procedure'                // Recommander procédure
}


export enum PriorityLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3,
}
