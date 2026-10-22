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

/** Origine d'une version : dépôt manuel, studio de documents du chat, restauration. */
export type DocumentVersionSource = 'upload' | 'ai_studio' | 'restore';

/**
 * Fichier remplacé d'un document classé. Le document garde son id (liens
 * d'étapes, mentions @, e-mails, portail) ; chaque remplacement archive ici
 * le fichier précédent avec son numéro de version.
 */
@Entity('document_customer_versions')
@Index('IDX_document_customer_versions_document', ['tenant_id', 'document_id'])
@BusinessTable({
  label: 'Versions des documents',
  description:
    "Versions précédentes d'un document classé (fichier remplacé, numéro de version, auteur, origine). La version courante reste dans document_customer.",
  icon: '🗂️',
  category: 'document',
})
export class DocumentCustomerVersion extends TenantEntity {
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
    description: 'Document dont cette ligne est une version précédente (document_customer.id)',
    importance: 'critical',
    group: 'relation',
  })
  document_id: number;

  @ManyToOne(() => DocumentCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentCustomer;

  @Column({ type: 'int' })
  @BusinessColumn({
    label: 'Version',
    description: 'Numéro de la version archivée',
    importance: 'high',
    group: 'versioning',
  })
  version: number;

  @Column({ type: 'varchar', length: 255 })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom du document au moment de cette version',
    importance: 'high',
    group: 'identification',
  })
  name: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1024, nullable: true })
  @BusinessColumn({ label: 'Chemin', description: 'Fichier archivé', importance: 'low', group: 'stockage', ignored: true })
  file_path: string | null;

  @Column({ name: 'file_url', type: 'varchar', length: 1024, nullable: true })
  @BusinessColumn({ label: 'URL', description: 'Lien du fichier archivé', importance: 'low', group: 'stockage', ignored: true })
  file_url: string | null;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  @BusinessColumn({ label: 'Taille', description: 'Taille en octets', unit: 'bytes', importance: 'low', group: 'stockage' })
  file_size: number | null;

  @Column({ name: 'file_mimetype', type: 'varchar', length: 255, nullable: true })
  @BusinessColumn({ label: 'Type MIME', description: 'Type du fichier', importance: 'low', group: 'stockage', ignored: true })
  file_mimetype: string | null;

  @Column({ type: 'varchar', length: 20, default: 'upload' })
  @BusinessColumn({
    label: 'Origine',
    description: 'upload = fichier remplacé à la main, ai_studio = modifié avec le studio IA, restore = restauration',
    importance: 'medium',
    group: 'versioning',
  })
  source: DocumentVersionSource;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({ label: 'Commentaire', description: 'Note sur la modification', importance: 'medium', group: 'contenu' })
  comment: string | null;

  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  @BusinessColumn({ label: 'Auteur', description: 'Utilisateur qui a remplacé le fichier', importance: 'low', group: 'audit', ignored: true })
  created_by_id: number | null;

  @ManyToOne(() => User, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User | null;
}
