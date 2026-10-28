import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Corbeille des dossiers : identifiants marqués supprimés avec le dossier,
 * par table, pour pouvoir tout restaurer. Lue et écrite en SQL explicite par
 * DossierDeletionService (pas de filtrage tenant automatique).
 */
@Entity('dossier_deletions')
@Index(['tenant_id', 'created_at'])
export class DossierDeletion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  tenant_id: number;

  @Column({ type: 'int' })
  dossier_id: number;

  @Column({ type: 'varchar', length: 100 })
  dossier_number: string;

  /** Catégories cochées au moment de la suppression. */
  @Column({ type: 'json' })
  include_categories: string[];

  /** `{ table: ids[] }` des lignes passées en `deleted_at`. */
  @Column({ type: 'json' })
  items: Record<string, Array<number | string>>;

  @Column({ type: 'varchar', length: 190 })
  deleted_by: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'datetime', nullable: true })
  restored_at: Date | null;
}
