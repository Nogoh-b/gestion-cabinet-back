import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Trace de chaque ligne créée par le générateur de données de test d'un
 * cabinet : le reset n'efface que ces lignes, jamais les données réelles.
 */
@Entity('sample_data_records')
@Index(['tenant_id', 'entity'])
export class SampleDataRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  tenant_id: number;

  @Column({ type: 'varchar', length: 36 })
  batch_id: string;

  /** users | clients | dossiers | conversations_ia (le reste suit le dossier). */
  @Column({ type: 'varchar', length: 40 })
  entity: string;

  @Column({ type: 'varchar', length: 64 })
  entity_id: string;

  @CreateDateColumn()
  created_at: Date;
}
