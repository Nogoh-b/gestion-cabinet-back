// entities/stage.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { SubStage } from './sub-stage.entity';
import { Transition } from './transition.entity';

@Entity('stages')
export class Stage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @ManyToOne(() => ProcedureTemplate, (template) => template.stages, { 
    onDelete: 'CASCADE',
    nullable: false, // Important : templateId ne peut pas être null
  })
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column()
  order: number;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: false })
  canBeSkipped: boolean;

  @Column({ default: true })
  canBeReentered: boolean;
    @OneToMany(() => Transition, (transition) => transition.fromStage)
  outgoingTransitions: Transition[];

  @OneToMany(() => Transition, (transition) => transition.toStage)
  incomingTransitions: Transition[];

  @OneToMany(() => SubStage, (subStage) => subStage.stage, { cascade: true })
  subStages: SubStage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}