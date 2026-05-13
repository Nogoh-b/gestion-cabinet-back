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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { BaseEntity } from 'src/core/entities/baseEntity';

@Entity('cycles')
@BusinessTable({
  label: 'Cycles',
  description: 'Cycles de répétition entre étapes d\'un modèle de procédure. Permettent de revenir à une étape antérieure un nombre limité de fois.',
  icon: '🔄',
  category: 'procedure',
})
export class Cycle extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du cycle (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: string;

  @Column({ name: 'templateId' })
  @BusinessColumn({
    label: 'Modèle',
    description: 'Identifiant du modèle de procédure',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  templateId: string;

  @ManyToOne(() => ProcedureTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column({ name: 'fromStageId' })
  @BusinessColumn({
    label: 'Étape source',
    description: 'Identifiant de l\'étape de départ du cycle',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  fromStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column({ name: 'toStageId' })
  @BusinessColumn({
    label: 'Étape destination',
    description: 'Identifiant de l\'étape de retour du cycle',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  toStageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toStageId' })
  toStage: Stage;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Libellé du cycle',
    example: 'Retour en phase de mise en état pour pièces complémentaires',
    importance: 'medium',
    group: 'identification',
  })
  label: string | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Condition',
    description: 'Condition JavaScript pour déclencher le cycle',
    importance: 'low',
    group: 'règles',
    ignored: true,
  })
  condition: string | null;

  @Column({ type: 'int', default: 1 })
  @BusinessColumn({
    label: 'Nombre max de cycles',
    description: 'Nombre maximum de répétitions autorisées',
    example: '3',
    importance: 'high',
    group: 'règles',
  })
  maxLoops: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}