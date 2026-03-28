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
CYCLE_APPLIED = 'cycle_applied',

  SUBSTAGE_STARTED = 'substage_started',
  SUBSTAGE_BLOCKED = 'substage_blocked',
  SUBSTAGE_UNBLOCKED = 'substage_unblocked',
  SUBSTAGE_SKIPPED = 'substage_skipped',



  INSTANCE_CREATED = 'instance_created',
  INSTANCE_STARTED = 'instance_started',
  INSTANCE_COMPLETED = 'instance_completed',
  INSTANCE_CANCELLED = 'instance_cancelled',
  STAGE_ENTERED = 'stage_entered',
  STAGE_COMPLETED = 'stage_completed',
  SUB_STAGE_ENTERED = 'sub_stage_entered',
  SUB_STAGE_COMPLETED = 'sub_stage_completed',
  TRANSITION_TRIGGERED = 'transition_triggered',
  USER_ACTION = 'user_action',
  ERROR_OCCURRED = 'error_occurred',


}