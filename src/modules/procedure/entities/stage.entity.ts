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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { BaseEntity } from 'src/core/entities/baseEntity';

@Entity('stages')
@BusinessTable({
  label: 'Étapes',
  description: 'Étapes d\'un modèle de procédure. Chaque étape peut contenir des sous-étapes et des transitions vers d\'autres étapes.',
  icon: '📌',
  category: 'procedure',
})
export class Stage extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'étape (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: string;

  @Column()
  @BusinessColumn({
    label: 'Modèle',
    description: 'Identifiant du modèle de procédure parent',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  templateId: string;

  @ManyToOne(() => ProcedureTemplate, (template) => template.stages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column()
  @BusinessColumn({
    label: 'Ordre',
    description: 'Position de l\'étape dans le déroulement de la procédure',
    example: '1',
    importance: 'high',
    group: 'organisation',
  })
  order: number;

  @Column()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom de l\'étape',
    example: 'Mise en état',
    importance: 'critical',
    group: 'identification',
  })
  name: string;

  @Column({ nullable: true, type: 'text' })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée de l\'étape',
    example: 'Phase de mise en état du dossier avant l\'audience',
    importance: 'high',
    group: 'identification',
  })
  description: string;

  @Column({ default: false })
  @BusinessColumn({
    label: 'Peut être sautée',
    description: 'Indique si cette étape peut être ignorée',
    importance: 'medium',
    group: 'règles',
  })
  canBeSkipped: boolean;

  @Column({ default: true })
  @BusinessColumn({
    label: 'Réentrable',
    description: 'Indique si on peut revenir à cette étape après l\'avoir quittée',
    importance: 'medium',
    group: 'règles',
  })
  canBeReentered: boolean;

  @OneToMany(() => Transition, (transition) => transition.fromStage)
  outgoingTransitions: Transition[];

  @OneToMany(() => Transition, (transition) => transition.toStage)
  incomingTransitions: Transition[];

  @OneToMany(() => SubStage, (subStage) => subStage.stage, { cascade: true })
  subStages: SubStage[];

  @OneToOne(() => StageConfig, (config) => config.stage, { cascade: true })
  config: StageConfig;

  @ManyToMany(() => DocumentCustomer, (document) => document.subStages)
  documents: DocumentCustomer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}