import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { DocumentCustomer } from './document-customer.entity';
import { AntivirusStatus } from '../antivirus-status.enum';
import { Exclude } from 'class-transformer';
export { AntivirusStatus } from '../antivirus-status.enum';

export enum DocumentVersionStatus {
  QUARANTINED = 'QUARANTINED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REFUSED = 'REFUSED',
  REVOKED = 'REVOKED',
}

@Entity('document_versions')
@Unique(['tenant_id', 'documentId', 'versionNumber'])
@Index(['tenant_id', 'sha256'])
export class DocumentVersion extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'int' })
  documentId: number;

  @ManyToOne(() => DocumentCustomer, (document) => document.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document: DocumentCustomer;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ name: 'storage_key', length: 500 })
  @Exclude()
  storageKey: string;

  @Column({ name: 'original_name', length: 255 })
  originalName: string;

  @Column({ name: 'detected_mime', length: 150 })
  detectedMime: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'author_id', type: 'int', nullable: true })
  authorId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({
    type: 'enum',
    enum: DocumentVersionStatus,
    default: DocumentVersionStatus.QUARANTINED,
  })
  status: DocumentVersionStatus;

  @Column({
    name: 'antivirus_status',
    type: 'enum',
    enum: AntivirusStatus,
    default: AntivirusStatus.PENDING,
  })
  antivirusStatus: AntivirusStatus;

  @Column({ name: 'reviewed_by', type: 'int', nullable: true })
  reviewedBy: number | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'decision_reason', type: 'text', nullable: true })
  decisionReason: string | null;

  @Column({ name: 'signature_value', type: 'text', nullable: true })
  @Exclude()
  signatureValue: string | null;

  @Column({ name: 'sealed_at', type: 'datetime', nullable: true })
  sealedAt: Date | null;

  @Column({ name: 'quarantine_reason', type: 'text', nullable: true })
  quarantineReason: string | null;

  @Column({ name: 'legal_hold', type: 'boolean', default: false })
  legalHold: boolean;
}
