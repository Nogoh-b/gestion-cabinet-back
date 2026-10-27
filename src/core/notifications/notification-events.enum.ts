/**
 * Catalogue centralisé des événements notifiables.
 *
 * Les valeurs doivent matcher NotificationType côté module `notification`
 * (cohérence du in-app) ET les templates côté front
 * (`app/configs/notifications/index.ts`). Voir mapping à jour dans la PR.
 *
 * Ajouter ici tout nouvel événement déclenché depuis un `*.subscriber.ts`.
 */
export enum NotifiableEvent {
  // Dossiers
  DOSSIER_CREATED = 'dossier_created',
  DOSSIER_UPDATED = 'dossier_updated',
  DOSSIER_STATUS_CHANGED = 'dossier_status_changed',
  DOSSIER_CLOSED = 'dossier_closed',

  // Collaboration
  COLLABORATOR_ADDED = 'collaborator_added',
  COLLABORATOR_REMOVED = 'collaborator_removed',

  // Audiences
  AUDIENCE_CREATED = 'audience_created',
  AUDIENCE_UPDATED = 'audience_updated',
  AUDIENCE_REMINDER = 'audience_reminder',
  AUDIENCE_HELD = 'audience_held',
  AUDIENCE_CANCELLED = 'audience_cancelled',

  // Factures
  FACTURE_CREATED = 'facture_created',
  FACTURE_PAID = 'facture_paid',
  FACTURE_OVERDUE = 'facture_overdue',

  // Paiements
  PAIEMENT_RECEIVED = 'paiement_received',
  PAIEMENT_REJECTED = 'paiement_rejected',

  // Documents
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_SHARED = 'document_shared',
  DOCUMENT_VALIDATED = 'document_validated',
  DOCUMENT_REFUSED = 'document_refused',

  // Diligences
  DILIGENCE_ASSIGNED = 'diligence_assigned',
  DILIGENCE_COMPLETED = 'diligence_completed',

  // Procédure
  PROCEDURE_STAGE_CHANGED = 'procedure_stage_changed',

  // Portail client — actions du client, à destination du cabinet
  CLIENT_DOCUMENT_UPLOADED = 'client_document_uploaded',
  CLIENT_PAYMENT_DECLARED = 'client_payment_declared',
  CLIENT_MESSAGE_RECEIVED = 'client_message_received',

  // Portail client — réponses du cabinet, à destination du client
  CABINET_MESSAGE_RECEIVED = 'cabinet_message_received',
}

/** Canaux d'un événement notifié. */
export interface ChannelPreference {
  in_app: boolean;
  email: boolean;
}

/**
 * Public d'un événement.
 * - `client`  : l'audience cliente du dossier (e-mail uniquement, déclenché par
 *               la case « Notifier le client » du modal).
 * - `lawyer`  : avocat référent du dossier.
 * - `collabs` : collaborateurs ajoutés au dossier.
 * - `admins`  : auto-résolus (tous les users avec role.code = 'admin').
 *               Reçoivent TOUJOURS in-app et e-mail (configurable globalement
 *               via app_settings.notification_email).
 */
export interface DispatchAudience {
  client?: {
    user_id?: number;
    /**
     * Fiche client : sert à retrouver le compte du portail (`user.customer_id`)
     * quand `user_id` n'est pas fourni, pour notifier aussi dans l'application.
     */
    customer_id?: number;
    email?: string;
    /**
     * Déclenche les notifications destinées au client pour cet évènement.
     * Si `user_id` est présent, cela peut inclure l'in-app et l'e-mail selon
     * les préférences utilisateur ; sinon, on retombe sur l'e-mail uniquement.
     */
    notify: boolean;
  };
  lawyer_id?: number | null;
  collaborator_ids?: number[];
  /**
   * Surcharge ponctuelle de la résolution auto des admins. Si fourni,
   * remplace la liste des admins par défaut.
   */
  admin_ids_override?: number[];
}
