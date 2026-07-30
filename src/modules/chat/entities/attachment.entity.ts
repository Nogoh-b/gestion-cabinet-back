// src/chat/entities/attachment.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Message } from './messages.entity';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { Exclude, Expose } from 'class-transformer';

export enum AttachmentType {
  IMAGE = 'image',
  DOCUMENT = 'document',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file'
}

export enum ChatAttachmentSecurityStatus {
  QUARANTINED = 'QUARANTINED',
  CLEAN = 'CLEAN',
  REJECTED = 'REJECTED',
  MISSING = 'MISSING',
}

@Entity()
export class Attachment extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fileName: string;

  @Column()
  @Exclude()
  filePath: string;

  @Column()
  fileSize: number; // Taille en bytes

  @Column({
    type: 'enum',
    enum: AttachmentType,
    default: AttachmentType.FILE
  })
  fileType: AttachmentType;

  @Column({ nullable: true })
  mimeType: string | null; // Type MIME original

  @Column({ nullable: true })
  @Exclude()
  cloudinaryPublicId: string | null; // Si vous utilisez Cloudinary
  @Column({ name: 'fileUrl', nullable: true })
  @Exclude()
  legacyFileUrl: string | null;

  @Column({ nullable: true })
  @Exclude()
  thumbnailPath: string | null;



  @Column({ name: 'thumbnailUrl', nullable: true })
  @Exclude()
  legacyThumbnailUrl: string | null; // Pour les images/vidéos

  @Column({ default: false })
  isUploaded: boolean;

  @ManyToOne(() => Message, message => message.attachments, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  message: Message;

  @Column({ name: 'conversation_id', type: 'int', nullable: true })
  conversationId: number | null;

  @Column({ name: 'uploaded_by_id', type: 'int', nullable: true })
  uploadedById: number | null;

  @Column({ name: 'storage_key', length: 512, nullable: true })
  @Exclude()
  storageKey: string | null;

  @Column({ name: 'sha256', type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ name: 'original_name', length: 255, nullable: true })
  originalName: string | null;

  @Column({ name: 'detected_mime', length: 255, nullable: true })
  detectedMime: string | null;

  @Column({
    name: 'security_status',
    type: 'enum',
    enum: ChatAttachmentSecurityStatus,
    default: ChatAttachmentSecurityStatus.QUARANTINED,
  })
  securityStatus: ChatAttachmentSecurityStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Expose()
  get contentUrl(): string {
    const base = (process.env.APP_URL ?? '').replace(/\/+$/, '');
    return `${base}/chat/attachments/${this.id}/content`;
  }

  @Expose()
  get fileUrl(): string {
    return this.contentUrl;
  }

  @Expose()
  get thumbnailUrl(): string {
    return this.contentUrl;
  }
}
