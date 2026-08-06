// src/common/enums/dossier_status.enum.ts
export enum DossierLifecycleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

/** Alias temporaire de nom, limité au seul cycle de vie administratif. */
export { DossierLifecycleStatus as DossierStatus };
export enum PriorityLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3,
}
