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
import { TransitionType } from './enums/instance-status.enum';
import { ProcedureTemplate } from './procedure-template.entity';

@Entity('transitions')
export class Transition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fromStageId: string;

  @ManyToOne(() => Stage, (stage) => stage.outgoingTransitions)
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column()
  toStageId: string;

  @ManyToOne(() => Stage, (stage) => stage.incomingTransitions)
  @JoinColumn({ name: 'toStageId' })
  toStage: Stage;

  @Column({ type: 'enum', enum: TransitionType, default: TransitionType.MANUAL })
  type: TransitionType;

  @Column({ nullable: true, type: 'text' })
  triggerEvent: string;

  @Column({ nullable: true, type: 'json' })
  triggerCondition: any;

  @Column({ nullable: true })
  label: string;

  @Column({ nullable: true, type: 'json' })
  condition: any;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: true })
  requiresDecision: boolean;

  @Column({ default: false })
  requiresValidation: boolean;

  @Column({ nullable: true, type: 'json' })
  onTransition: any;

@ManyToOne(() => ProcedureTemplate, (template) => template.stages, { 
    onDelete: 'CASCADE',
    nullable: false, // Important : templateId ne peut pas être null
})
@JoinColumn({ name: 'templateId' })
template: ProcedureTemplate;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}