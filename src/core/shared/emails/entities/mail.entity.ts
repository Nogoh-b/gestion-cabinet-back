import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ValueTransformer,
} from 'typeorm';
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
  to: (value?: AttachmentMail[] | null) =>
    value == null ? null : JSON.stringify(value),
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
// Lecture seule, limitée aux e-mails reçus par l'utilisateur (colonne to, voir ai-scoped-tables.ts).
@BusinessTable({
  label: 'Mes e-mails',
  description:
    "E-mails envoyés par l'application dont l'utilisateur connecté est destinataire : objet, statut (pending, sent, failed…), date d'envoi (sentAt).",
  category: 'communication',
  readOnly: true,
})
export class Mail extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: string;

  @Column({ nullable: true, unique: true })
  @BusinessColumn({
    label: 'Clé',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  deduplicationKey?: string; // Clé unique pour éviter les doublons

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Modèle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  templateName?: string; // Nom du template (ex: 'welcome', 'invoice')

  @Column({ type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Données du modèle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  context?: Record<string, any>; // Données pour le template

  @Column({ type: 'simple-array' })
  @BusinessColumn({
    label: 'Destinataires',
    description: 'Adresses des destinataires',
  })
  to: string[]; // Liste des destinataires principaux

  @Column({ type: 'simple-array', nullable: true })
  @BusinessColumn({ label: 'Copie', description: 'Adresses en copie' })
  cc?: string[];

  @Column({ type: 'simple-array', nullable: true })
  @BusinessColumn({
    label: 'Copie cachée',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  bcc?: string[];

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Objet',
    description: "Objet de l'e-mail",
    importance: 'critical',
  })
  subject?: string; // Sujet (peut être surchargé ou utilisé si pas de template)

  @Column({ type: 'longtext', nullable: true })
  @BusinessColumn({
    label: 'Contenu HTML',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  html?: string; // Contenu HTML si pas de template (longtext: l'en-tête peut contenir un logo base64 > 64 Ko)

  @Column({ type: 'longtext', nullable: true })
  @BusinessColumn({ label: 'Texte', description: "Contenu texte de l'e-mail" })
  text?: string; // Version texte

  // longtext : le composer envoie encore les pièces en base64.
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: attachmentsTransformer,
  })
  @BusinessColumn({
    label: 'Pièces jointes',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
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
  @BusinessColumn({
    label: 'Erreur',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  errorMessage?: string;

  @Column({ default: 0 })
  @BusinessColumn({
    label: 'Tentatives',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  retryCount: number;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Dernière tentative',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  lastAttemptAt?: Date;

  @Column({ type: 'simple-json', nullable: true })
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  metadata?: Record<string, any>; // Pour stocker des infos supplémentaires (ex: entité liée)

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity
}
