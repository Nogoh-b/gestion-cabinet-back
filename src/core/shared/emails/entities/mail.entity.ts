import { Entity, PrimaryGeneratedColumn, Column, ValueTransformer } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';

export enum MailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AttachmentMail {
  filename: string;
  content?: string | Buffer; // base64 ou Buffer encodé
  path?: string; // fichier sous uploads/, lu à l'envoi (pièces de la GED)
  href?: string;
  contentType?: string;
  /** Liste relue tronquée (ancienne colonne TEXT) : l'envoi échoue au lieu de partir sans pièce. */
  unreadable?: boolean;
}

/**
 * JSON des pièces jointes. Une ligne tronquée par l'ancienne colonne TEXT
 * (base64 > 64 Ko) ne casse plus la lecture de l'historique.
 */
const attachmentsTransformer: ValueTransformer = {
  to: (value?: AttachmentMail[] | null) => (value == null ? null : JSON.stringify(value)),
  from: (value?: string | null): AttachmentMail[] | undefined => {
    if (value == null || value === '') return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return [{ filename: 'Pièces jointes illisibles', unreadable: true }];
    }
  },
};

@Entity('mails')
export class Mail extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, unique: true })
  deduplicationKey?: string; // Clé unique pour éviter les doublons

  @Column({ nullable: true })
  templateName?: string; // Nom du template (ex: 'welcome', 'invoice')

  @Column({ type: 'simple-json', nullable: true })
  context?: Record<string, any>; // Données pour le template

  @Column({ type: 'simple-array' })
  to: string[]; // Liste des destinataires principaux

  @Column({ type: 'simple-array', nullable: true })
  cc?: string[];

  @Column({ type: 'simple-array', nullable: true })
  bcc?: string[];

  @Column({ nullable: true })
  subject?: string; // Sujet (peut être surchargé ou utilisé si pas de template)

  @Column({ type: 'longtext', nullable: true })
  html?: string; // Contenu HTML si pas de template (longtext: l'en-tête peut contenir un logo base64 > 64 Ko)

  @Column({ type: 'longtext', nullable: true })
  text?: string; // Version texte

  // longtext : le composer envoie encore les pièces en base64.
  @Column({ type: 'longtext', nullable: true, transformer: attachmentsTransformer })
  attachments?: Array<AttachmentMail>;

  @Column({ type: 'enum', enum: MailStatus, default: MailStatus.PENDING })
  status: MailStatus;

  @Column({ nullable: true })
  scheduledAt?: Date; // Date d'envoi programmé (null = envoi immédiat)

  @Column({ nullable: true })
  sentAt?: Date;

  @Column({ nullable: true })
  failedAt?: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  lastAttemptAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>; // Pour stocker des infos supplémentaires (ex: entité liée)

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity
}
