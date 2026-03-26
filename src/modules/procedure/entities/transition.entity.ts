// entities/transition.entity.ts
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
import { ProcedureTemplate } from './procedure-template.entity';

export enum TransitionType {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}

@Entity('transitions')
export class Transition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({
    type: 'enum',
    enum: TransitionType,
    default: TransitionType.MANUAL,
  })
  type: TransitionType;

  @Column({ type: 'text', nullable: true })
  label: string | null;

  @Column({ type: 'text', nullable: true })
  condition: string | null;

  @Column({ type: 'text', nullable: true })
  triggerEvent: string | null;

  @Column({ type: 'text', nullable: true })
  triggerCondition: string | null;

  @Column({ type: 'text', nullable: true })
  templateId: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

@JoinColumn({ name: 'templateId' })
template: ProcedureTemplate;

  @Column({ type: 'boolean', default: true })
  requiresDecision: boolean;

  @Column({ type: 'boolean', default: false })
  requiresValidation: boolean;

  @Column({ type: 'text', nullable: true })
  onTransition: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}