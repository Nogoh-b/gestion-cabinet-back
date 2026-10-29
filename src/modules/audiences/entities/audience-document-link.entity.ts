// src/modules/audiences/entities/audience-document-link.entity.ts
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Audience } from './audience.entity';

export type AudienceDocumentPhase = 'preparation' | 'after';

/**
 * Ligne de la table de jointure `audience_documents` (relation many-to-many
 * `Audience.documents`), avec le moment du document (migration
 * 1793400000000-AudienceDocumentPhase).
 *
 * TypeORM ne sait pas porter une colonne en plus sur une jointure
 * `@JoinTable` : en `synchronize:true` (scripts de dev via `src/data-source.ts`),
 * il supprimait `phase`. La jointure est donc déclarée `synchronize: false` et
 * c'est cette entité qui décrit le schéma de la table. Colonnes, index et clés
 * étrangères reprennent à l'identique ceux de la jointure (mêmes noms générés),
 * pour que la synchronisation n'y voie aucune différence.
 *
 * Les lectures et écritures passent toujours par `Audience.documents` ; un
 * nouveau lien prend la valeur par défaut `preparation`.
 */
@Entity('audience_documents')
export class AudienceDocumentLink {
  @PrimaryColumn({ name: 'audience_id', type: 'int' })
  @Index()
  audience_id: number;

  @PrimaryColumn({ name: 'document_id', type: 'int' })
  @Index()
  document_id: number;

  @Column({ type: 'varchar', length: 20, default: 'preparation' })
  phase: AudienceDocumentPhase;

  @ManyToOne(() => Audience, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'audience_id' })
  audience: Audience;

  @ManyToOne(() => DocumentCustomer, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({ name: 'document_id' })
  document: DocumentCustomer;
}
