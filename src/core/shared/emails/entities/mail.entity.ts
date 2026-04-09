import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

export enum MailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AttachmentMail {
  filename: string;
  content?: string | Buffer;      // base64 ou Buffer encodé
  path?: string;
  href?: string;
  contentType?: string;
}

@Entity('mails')
export class Mail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, unique: true })
  deduplicationKey?: string; // Clé unique pour éviter les doublons

  @Column({ nullable: true })
  templateName?: string; // Nom du template (ex: 'welcome', 'invoice')

  @Column({ type: 'json', nullable: true })
  context?: Record<string, any>; // Données pour le template

  @Column({ type: 'simple-array' })
  to: string[]; // Liste des destinataires principaux

  @Column({ type: 'simple-array', nullable: true })
  cc?: string[];

  @Column({ type: 'simple-array', nullable: true })
  bcc?: string[];

  @Column({ nullable: true })
  subject?: string; // Sujet (peut être surchargé ou utilisé si pas de template)

  @Column({ type: 'text', nullable: true })
  html?: string; // Contenu HTML si pas de template

  @Column({ type: 'text', nullable: true })
  text?: string; // Version texte

  @Column({ type: 'json', nullable: true })
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

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>; // Pour stocker des infos supplémentaires (ex: entité liée)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}