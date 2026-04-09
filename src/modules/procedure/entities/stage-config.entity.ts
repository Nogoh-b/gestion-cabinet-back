// entities/stage-config.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Stage } from './stage.entity';

@Entity('stage_configs')
export class StageConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stageId' })
  stageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

  @Column({ type: 'boolean', default: false })
  allowDocuments: boolean;

  @Column({ type: 'boolean', default: false })
  allowDiligences: boolean;

  @Column({ type: 'boolean', default: false })
  allowInvoices: boolean;

  @Column({ type: 'boolean', default: false })
  allowHearings: boolean;

  @Column({ type: 'text', nullable: true })
  documentTypesAllowed: string | null;

  @Column({ type: 'text', nullable: true })
  diligenceConfig: string | null;

  @Column({ type: 'text', nullable: true })
  hearingConfig: string | null;

  @Column({ type: 'text', nullable: true })
  invoiceConfig: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}