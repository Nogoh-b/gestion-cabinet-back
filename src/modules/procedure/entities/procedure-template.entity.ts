import { Entity, Column, PrimaryGeneratedColumn, OneToMany, Unique } from 'typeorm';
import { Stage } from './stage.entity';
import { Transition } from './transition.entity';
import { Cycle } from './cycle.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

export enum ProcedureTemplateLifecycle {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  RETIRED = 'RETIRED',
}

@Entity('procedure_templates')
@BusinessTable({
  label: 'Modèles de procédure',
  description: 'Modèles de procédure définissant les étapes, transitions et cycles pour différents types de procédures juridiques',
  icon: '📋',
  category: 'procedure',
  ignored: false,
})
@Unique(['tenant_id', 'familyId', 'version'])
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

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

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

  @Column({
    name: 'lifecycle_status',
    type: 'enum',
    enum: ProcedureTemplateLifecycle,
    default: ProcedureTemplateLifecycle.DRAFT,
  })
  lifecycleStatus: ProcedureTemplateLifecycle;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'retired_at', type: 'datetime', nullable: true })
  retiredAt: Date | null;

  @Column({ name: 'content_hash', type: 'char', length: 64, nullable: true })
  contentHash: string | null;

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
