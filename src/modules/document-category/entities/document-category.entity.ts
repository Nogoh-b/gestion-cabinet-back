import { Expose } from 'class-transformer';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany } from 'typeorm';


@Entity('document_categories')
export class DocumentCategory {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column({ unique: true })
  @Expose()
  code: string;

  @Column()
  @Expose()
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  description: string;

  @Column({ nullable: true })
  @Expose()
  icon: string;

  @Column({ default: '#4F46E5' })
  @Expose()
  color: string;

  @Column({ default: 0 })
  @Expose()
  sort_order: number;

  @Column({ default: true })
  @Expose()
  is_active: boolean;

  @Column({ default: false })
  @Expose()
  is_system: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  metadata: {
    retention_period?: number; // en jours
    allowed_mime_types?: string[];
    max_file_size_mb?: number;
    requires_validation?: boolean;
    board_approval?: boolean;
    shareholder_rights?: boolean;
    corporate_governance?: boolean;
    intellectual_property?: boolean;
    technical_validation?: boolean;
    methodology_documented?: boolean;
    peer_review?: boolean;
    gdpr_compliance?: boolean;
    tax_withholding?: boolean;
    social_security?: boolean;
    employee_rights?: boolean;
    legal_importance?: string;
    confidentiality_level?: 'public' | 'internal' | 'confidential' | 'strictly_confidential';
  };

  // @OneToMany(() => DocumentType, (documentType) => documentType.category)
  @ManyToMany(() => DocumentType, (documentType) => documentType.categories)

  documentTypes: DocumentType[];

  @CreateDateColumn()
  @Expose()
  created_at: Date;

  @UpdateDateColumn()
  @Expose()
  updated_at: Date;
}