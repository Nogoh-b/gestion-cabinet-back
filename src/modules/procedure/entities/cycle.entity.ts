// entities/cycle.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { Stage } from './stage.entity';

@Entity('cycles')
export class Cycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'templateId' })
  templateId: string;

  @ManyToOne(() => ProcedureTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column({ name: 'fromStageId' })
  fromStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column({ name: 'toStageId' })
  toStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toStageId' })
  toStage: Stage;

  @Column({ type: 'text', nullable: true })
  label: string | null;

  @Column({ type: 'text', nullable: true })
  condition: string | null;

  @Column({ type: 'int', default: 1 })
  maxLoops: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}