// src/modules/notification/enums/notification-type.enum.ts
export enum NotificationType {
  MESSAGE = 'message',
  DOSSIER_CREATED = 'dossier_created',
  DOSSIER_UPDATED = 'dossier_updated',
  DOSSIER_STATUS_CHANGED = 'dossier_status_changed',
  AUDIENCE_CREATED = 'audience_created',
  AUDIENCE_UPDATED = 'audience_updated',
  AUDIENCE_REMINDER = 'audience_reminder',
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_SHARED = 'document_shared',
  FACTURE_CREATED = 'facture_created',
  FACTURE_PAID = 'facture_paid',
  FACTURE_OVERDUE = 'facture_overdue',
  DILIGENCE_ASSIGNED = 'diligence_assigned',
  DILIGENCE_COMPLETED = 'diligence_completed',
  COLLABORATOR_ADDED = 'collaborator_added',
  COLLABORATOR_REMOVED = 'collaborator_removed',
  SYSTEM = 'system',
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}