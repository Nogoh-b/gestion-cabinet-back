// enums/instance-status.enum.ts
export enum InstanceStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
  ABANDONED = 'abandoned',
}

// enums/task-status.enum.ts
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

// enums/transition-type.enum.ts
export enum TransitionType {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}

// enums/event-type.enum.ts
export enum EventType {
  STAGE_ENTER = 'stage_enter',
  STAGE_EXIT = 'stage_exit',
  DECISION = 'decision',
  SUBSTAGE_COMPLETED = 'substage_completed',
  TASK_COMPLETED = 'task_completed',
  DOCUMENT_UPLOADED = 'document_uploaded',
}