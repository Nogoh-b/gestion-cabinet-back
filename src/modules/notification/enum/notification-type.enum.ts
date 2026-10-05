// src/modules/notification/enums/notification-type.enum.ts
export enum NotificationType {
  MESSAGE = 'message',
  DOSSIER_CREATED = 'dossier_created',
  DOSSIER_UPDATED = 'dossier_updated',
  DOSSIER_STATUS_CHANGED = 'dossier_status_changed',
  AUDIENCE_CREATED = 'audience_created',
  AUDIENCE_UPDATED = 'audience_updated',
  AUDIENCE_REMINDER = 'audience_reminder',
  AUDIENCE_HELD = 'audience_held',
  AUDIENCE_CANCELLED = 'audience_cancelled',
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_SHARED = 'document_shared',
  FACTURE_CREATED = 'facture_created',
  FACTURE_PAID = 'facture_paid',
  FACTURE_OVERDUE = 'facture_overdue',
  DILIGENCE_ASSIGNED = 'diligence_assigned',
  DILIGENCE_COMPLETED = 'diligence_completed',
  DILIGENCE_DEADLINE = 'diligence_deadline',
  DOSSIER_DEADLINE = 'dossier_deadline',
  COLLABORATOR_ADDED = 'collaborator_added',
  COLLABORATOR_REMOVED = 'collaborator_removed',
  // ── Parcours dossier : traitements d'une action ─────────────────────────────
  // L'assignation et la complétion sont déjà couvertes par la diligence liée
  // (DILIGENCE_ASSIGNED / DILIGENCE_COMPLETED) : ne pas les dupliquer ici.
  DOSSIER_ACTION_STARTED = 'dossier_action_started',
  DOSSIER_ACTION_ON_HOLD = 'dossier_action_on_hold',
  DOSSIER_ACTION_CANCELLED = 'dossier_action_cancelled',
  DOSSIER_ACTION_DEADLINE_EXTENDED = 'dossier_action_deadline_extended',
  // ── RH : permissions (congés) et avances sur salaire ────────────────────────
  EMPLOYEE_LEAVE_REQUESTED = 'employee_leave_requested',
  EMPLOYEE_LEAVE_APPROVED = 'employee_leave_approved',
  EMPLOYEE_LEAVE_REJECTED = 'employee_leave_rejected',
  EMPLOYEE_LEAVE_CANCELLED = 'employee_leave_cancelled',
  SALARY_ADVANCE_REQUESTED = 'salary_advance_requested',
  SALARY_ADVANCE_APPROVED = 'salary_advance_approved',
  SALARY_ADVANCE_PAID = 'salary_advance_paid',
  SALARY_ADVANCE_CANCELLED = 'salary_advance_cancelled',
  SYSTEM = 'system',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}
