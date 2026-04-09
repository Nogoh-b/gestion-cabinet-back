import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProcedureInstance } from './procedure-instance.entity';

@Entity('history_entries')
export class HistoryEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, (instance) => instance.history)
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  eventType: string;
  @Column({ type: 'varchar', nullable: true })
  stageId: string | null;

  @Column({  type: 'varchar', nullable: true })
  subStageId: string | null;  // Ajouter | null

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}