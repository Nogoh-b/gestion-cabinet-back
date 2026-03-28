// types/instance-mapped.type.ts

import { ProcedureInstance } from "../procedure-instance.entity";

export type SubStageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface MappedSubStage {
  id: string;
  name: string;
  description?: string;
  order: number;
  isMandatory: boolean;
  status: SubStageStatus;
  metadata: {
    startedAt?: string;
    completedAt?: string;
    notes?: string;
    documentIds?: number[];
    diligenceIds?: number[];
    invoiceIds?: number[];
    audienceIds?: number[];
  };
}

export interface MappedStage {
  id: string;
  name: string;
  description?: string;
  order: number;
  canBeSkipped: boolean;
  canBeReentered: boolean;
  subStages: MappedSubStage[];
  progress: number;
  config?: any;
}

export interface MappedInstance {
  instance: ProcedureInstance;
  stages: MappedStage[];
  currentStage: MappedStage;
  progress: number;
}