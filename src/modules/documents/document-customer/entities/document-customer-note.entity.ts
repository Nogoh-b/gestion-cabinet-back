import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DocumentCustomer } from './document-customer.entity';

/**
 * Note laissée sur un document classé (fil de notes de la visionneuse). La
 * version retenue est celle du document au moment de la note : une note sur
 * la v1 reste lisible après une modification.
 */
@Entity('document_customer_notes')
@Index('IDX_document_customer_notes_document', ['tenant_id', 'document_id'])
@BusinessTable({
  label: 'Notes des documents',
  description:
    "Fil de notes d'un document classé : texte, auteur, date et version du document au moment de la note.",
  icon: '📝',
  category: 'document',
})
export class DocumentCustomerNote extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant technique',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ name: 'document_id', type: 'int' })
  @BusinessColumn({
    label: 'Document',
    description: 'Document annoté (document_customer.id)',
    importance: 'critical',
    group: 'relation',
  })
  document_id: number;

  @ManyToOne(() => DocumentCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentCustomer;

  @Column({ type: 'text' })
  @BusinessColumn({
    label: 'Note',
    description: 'Texte de la note',
    importance: 'critical',
    group: 'contenu',
  })
  content: string;

  @Column({ name: 'author_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Auteur',
    description: 'Utilisateur qui a écrit la note (users.id)',
    importance: 'medium',
    group: 'audit',
  })
  author_id: number | null;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'author_id' })
  author: User | null;

  @Column({ type: 'int', default: 1 })
  @BusinessColumn({
    label: 'Version du document',
    description: 'Version du document au moment où la note a été écrite',
    importance: 'medium',
    group: 'versioning',
  })
  version: number;
}
