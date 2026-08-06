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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

export enum TransitionType {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}

@Entity('transitions')
@BusinessTable({
  label: 'Transitions',
  description: 'Transitions entre les étapes d\'un modèle de procédure. Définissent les chemins possibles d\'une étape à une autre, avec conditions et actions.',
  icon: '➡️',
  category: 'procedure',
  ignored: false,
})
export class Transition extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la transition (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: false,
  })
  id: string;

  @Column({ name: 'fromStageId' })
  @BusinessColumn({
    label: 'Étape source',
    description: 'Identifiant de l\'étape de départ. L\'étape source et destination doivent être différentes',
    importance: 'high',
    group: 'relation',
    ignored: false,
  })
  fromStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column({ name: 'toStageId' })
  @BusinessColumn({
    label: 'Étape destination',
    description: 'Identifiant de l\'étape d\'arrivée. L\'étape source et destination doivent être différentes',
    importance: 'high',
    group: 'relation',
    ignored: false,
  })
  toStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toStageId' })
  toStage: Stage;

  @Column({
    type: 'enum',
    enum: TransitionType,
    default: TransitionType.MANUAL,
  })
  @BusinessColumn({
    label: 'Type',
    description: "BD: 'automatic'=Automatique, 'manual'=Manuelle.",
    importance: 'high',
    group: 'règles',
  })
  type: TransitionType;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Libellé de la transition affiché à l\'utilisateur',
    example: 'Passer à l\'instruction',
    importance: 'high',
    group: 'identification',
  })
  label: string | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Condition',
    description: 'Condition JavaScript à évaluer pour autoriser la transition',
    importance: 'low',
    group: 'règles',
    ignored: false,
  })
  condition: string | null;

  @Column({ type: 'text', nullable: true })
  triggerEvent: string | null;

  @Column({ type: 'text', nullable: true })
  triggerCondition: string | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Modèle',
    description: 'Identifiant du modèle de procédure parent',
    importance: 'high',
    group: 'relation',
    ignored: false,
  })
  templateId: string | null;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Par défaut',
    description: 'Transition utilisée par défaut si aucune décision explicite',
    importance: 'medium',
    group: 'règles',
  })
  isDefault: boolean;

  @ManyToOne(() => ProcedureTemplate, (template) => template.transitions)
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column({ type: 'boolean', default: true })
  @BusinessColumn({
    label: 'Nécessite décision',
    description: 'Si vrai, une décision explicite est requise pour cette transition',
    importance: 'high',
    group: 'règles',
  })
  requiresDecision: boolean;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Nécessite validation',
    description: 'Si vrai, une validation supplémentaire est requise',
    importance: 'medium',
    group: 'règles',
  })
  requiresValidation: boolean;

  @Column({ type: 'text', nullable: true })
  onTransition: string | null;

  @Column({ type: 'boolean', default: false })
  expectsUserInput: boolean;

  @Column({ type: 'json', nullable: true })
  userInputs: {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'checkbox';
    required?: boolean;
    options?: { value: string; label: string }[];
    defaultValue?: any;
  }[];

  @Column({ type: 'json', nullable: true })
  preTransitionActions: any;

  @Column({ type: 'json', nullable: true })
  postTransitionActions: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
