// src/chat/entities/attachment.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Message } from './messages.entity';

export enum AttachmentType {
  IMAGE = 'image',
  DOCUMENT = 'document',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file'
}

@Entity()
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fileName: string;

  @Column()
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
  mimeType: string; // Type MIME original

  @Column({ nullable: true })
  cloudinaryPublicId: string; // Si vous utilisez Cloudinary
  @Column({ nullable: true })
  fileUrl: string;       // URL publique (ex: http://localhost:3000/uploads/chat/image.jpg)

  @Column({ nullable: true })
  thumbnailPath: string; // Chemin physique de la miniature



  @Column({ nullable: true })
  thumbnailUrl: string; // Pour les images/vidéos

  @Column({ default: false })
  isUploaded: boolean;

  @ManyToOne(() => Message, message => message.attachments, {
    onDelete: 'CASCADE'
  })
  message: Message;

  @CreateDateColumn()
  createdAt: Date;
}