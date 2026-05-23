import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProcedureInstance } from './procedure-instance.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

@Entity('history_entries')
@BusinessTable({
  label: 'Historique',
  description: 'Entrées d\'historique des actions réalisées sur une instance de procédure',
  icon: '📜',
  category: 'procedure',
  ignored: true,
})
export class HistoryEntry extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant', description: 'Identifiant unique', importance: 'low', group: 'technique', ignored: true })
  id: string;

  @Column()
  @BusinessColumn({ label: 'Instance', description: 'Instance de procédure', importance: 'high', group: 'relation', ignored: true })
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, (instance) => instance.history)
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  @BusinessColumn({ label: 'Type d\'événement', description: 'Type d\'événement', importance: 'high', group: 'identification' })
  eventType: string;

  @Column({ type: 'varchar', nullable: true })
  @BusinessColumn({ label: 'Étape', description: 'Étape concernée', importance: 'medium', group: 'relation', ignored: true })
  stageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  @BusinessColumn({ label: 'Sous-étape', description: 'Sous-étape concernée', importance: 'medium', group: 'relation', ignored: true })
  subStageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  @BusinessColumn({ label: 'Utilisateur', description: 'Utilisateur à l\'origine', importance: 'medium', group: 'audit' })
  userId: string | null;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({ label: 'Métadonnées', description: 'Données additionnelles', importance: 'low', group: 'technique', ignored: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}