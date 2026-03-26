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
    OneToOne,
    ManyToMany,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { SubStage } from './sub-stage.entity';
import { Transition } from './transition.entity';
import { StageConfig } from './stage-config.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';

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
  @OneToOne(() => StageConfig, (config) => config.stage, { cascade: true })
  config: StageConfig;
  @CreateDateColumn()
  createdAt: Date;
  @ManyToMany(() => DocumentCustomer, (document) => document.subStages)
  documents: DocumentCustomer[];

  @UpdateDateColumn()
  updatedAt: Date;
}