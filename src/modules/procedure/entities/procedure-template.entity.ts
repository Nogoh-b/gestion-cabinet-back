import { Entity, Column, PrimaryGeneratedColumn, OneToMany, Unique } from 'typeorm';
import { Stage } from './stage.entity';
import { Transition } from './transition.entity';
import { Cycle } from './cycle.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

@Entity('procedure_templates')
@BusinessTable({
  label: 'Modèles de procédure',
  description: 'Modèles de procédure définissant les étapes, transitions et cycles pour différents types de procédures juridiques',
  icon: '📋',
  category: 'procedure',
  ignored: false,
})
@Unique(['tenant_id', 'name'])
export class ProcedureTemplate extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du modèle (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: string;

  @Column()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom du modèle de procédure',
    example: 'Contentieux civil standard',
    importance: 'critical',
    group: 'identification',
  })
  name: string;

  @Column({ nullable: true, type: 'text' })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée du modèle de procédure',
    example: 'Modèle standard pour les contentieux civils',
    importance: 'high',
    group: 'identification',
  })
  description: string;

  @Column({ default: 1 })
  @BusinessColumn({
    label: 'Version',
    description: 'Version du modèle de procédure',
    example: '1',
    importance: 'low',
    group: 'gestion',
  })
  version: number;

  @Column({ default: true })
  @BusinessColumn({
    label: 'Actif',
    description: 'Indique si le modèle est actif et utilisable',
    importance: 'medium',
    group: 'gestion',
  })
  isActive: boolean;

  @OneToMany(() => Stage, (stage) => stage.template, { cascade: true })
  stages: Stage[];

  @OneToMany(() => Transition, (transition) => transition.template, { cascade: true })
  transitions: Transition[];

  @OneToMany(() => Cycle, (cycle) => cycle.template, { cascade: true })
  cycles: Cycle[];

  // @CreateDateColumn({ name: 'created_at' })
  // createdAt: Date;

  // @UpdateDateColumn({ name: 'updated_at' })
  // updatedAt: Date; 
}
