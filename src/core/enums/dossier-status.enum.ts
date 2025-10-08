// src/common/enums/dossier_status.enum.ts
export enum DossierStatus {
  OPEN = 0,           // Ouvert
  AMICABLE = 1,   // Amiable
  LITIGATION = 2, // Contentieux
  DECISION = 3,   // Décision
  APPEAL = 4,       // Recours
  CLOSED = 5,       // Clôturé
  ARCHIVED = 6    // Archivé
}

export enum PriorityLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3,
}
