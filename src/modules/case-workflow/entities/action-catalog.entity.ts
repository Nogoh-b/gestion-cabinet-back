import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActionPriority, BillingCalculationMode } from '../case-workflow.enums';

@Entity('case_action_families')
@Index('UQ_case_action_family_tenant_code', ['tenant_id', 'code'], {
  unique: true,
})
export class ActionFamily extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  code: string;

  @Column({ length: 160 })
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  display_order: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}

@Entity('case_action_definitions')
@Index('UQ_case_action_definition_version', ['tenant_id', 'code', 'version'], {
  unique: true,
})
@Index('IDX_case_action_definition_active', ['tenant_id', 'is_active'])
export class ActionDefinition extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id', type: 'varchar', length: 36 })
  family_id: string;

  @ManyToOne(() => ActionFamily, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'family_id' })
  family: ActionFamily;

  @Column({ length: 100 })
  code: string;

  @Column({ length: 200 })
  label: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'specific_fields_schema', type: 'json', nullable: true })
  specific_fields_schema: Record<string, unknown> | null;

  @Column({ name: 'allowed_results', type: 'json', nullable: true })
  allowed_results: Array<{ code: string; label: string }> | null;

  @Column({ name: 'required_relations', type: 'json', nullable: true })
  required_relations: Record<string, unknown> | null;

  @Column({ name: 'default_due_days', type: 'int', nullable: true })
  default_due_days: number | null;

  @Column({
    name: 'default_priority',
    type: 'enum',
    enum: ActionPriority,
    default: ActionPriority.NORMAL,
  })
  default_priority: ActionPriority;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  is_required: boolean;

  @Column({ name: 'billable_by_default', type: 'boolean', default: false })
  billable_by_default: boolean;

  @Column({
    name: 'billing_mode',
    type: 'enum',
    enum: BillingCalculationMode,
    nullable: true,
  })
  billing_mode: BillingCalculationMode | null;

  @Column({
    name: 'default_rate',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  default_rate: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}
