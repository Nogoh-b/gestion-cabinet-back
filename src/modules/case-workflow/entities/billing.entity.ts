import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import {
  BillableItemStatus,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
  BillingTrigger,
} from '../case-workflow.enums';
import { BusinessTable } from 'src/core/decorators/business-metadata.decorator';

@Entity('dossier_billing_profiles')
@BusinessTable({
  label: 'Profils de facturation des dossiers',
  description: 'Convention d’honoraires, devise, TVA et tarifs applicables à chaque dossier.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_dossier_billing_profile', ['tenant_id', 'dossier_id'], {
  unique: true,
})
export class DossierBillingProfile extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ length: 10, default: 'XAF' })
  currency: string;

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 6,
    scale: 3,
    default: 0,
  })
  vat_rate: number;

  @Column({ type: 'enum', enum: BillingMode, default: BillingMode.FIXED })
  mode: BillingMode;

  @Column({
    name: 'fixed_fee',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  fixed_fee: number | null;

  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  hourly_rate: number | null;

  @Column({
    name: 'percentage_rate',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  percentage_rate: number | null;

  @Column({
    name: 'percentage_base',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  percentage_base: number | null;

  @Column({
    name: 'opening_fee',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  opening_fee: number | null;

  @Column({ name: 'is_confirmed', type: 'boolean', default: false })
  is_confirmed: boolean;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  lock_version: number;
}

@Entity('dossier_billing_rules')
@Index(
  'UQ_dossier_billing_rule_version',
  ['tenant_id', 'dossier_id', 'code', 'version'],
  { unique: true },
)
export class DossierBillingRule extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ length: 100 })
  code: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: BillingTrigger })
  trigger: BillingTrigger;

  @Column({
    name: 'calculation_mode',
    type: 'enum',
    enum: BillingCalculationMode,
  })
  calculation_mode: BillingCalculationMode;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  rate: number | null;

  @Column({ name: 'base_field', type: 'varchar', length: 120, nullable: true })
  base_field: string | null;

  @Column({
    name: 'action_definition_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  action_definition_code: string | null;

  @Column({ name: 'fee_type', length: 120 })
  fee_type: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  lock_version: number;
}

@Entity('billable_items')
@BusinessTable({
  label: 'Éléments facturables',
  description: 'Travaux, honoraires et frais à contrôler, facturer, ajuster ou abandonner.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_billable_item_source_event', ['tenant_id', 'source_event_key'], {
  unique: true,
})
@Index('IDX_billable_item_selection', [
  'tenant_id',
  'dossier_id',
  'status',
  'occurred_at',
])
export class BillableItem extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ name: 'client_id', type: 'int' })
  client_id: number;

  @Column({ name: 'source_type', type: 'enum', enum: BillableSourceType })
  source_type: BillableSourceType;

  @Column({ name: 'source_id', type: 'varchar', length: 80 })
  source_id: string;

  @Column({ name: 'source_event_key', length: 180 })
  source_event_key: string;

  @Column({ type: 'datetime', name: 'occurred_at' })
  occurred_at: Date;

  @Column({ length: 255 })
  label: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 1 })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  unit_price: number;

  @Column({
    name: 'net_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  net_amount: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 6,
    scale: 3,
    default: 0,
  })
  tax_rate: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  tax_amount: number;

  @Column({
    name: 'gross_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  gross_amount: number;

  @Column({ length: 10, default: 'XAF' })
  currency: string;

  @Column({
    type: 'enum',
    enum: BillableItemStatus,
    default: BillableItemStatus.TO_INVOICE,
  })
  status: BillableItemStatus;

  @Column({ name: 'calculation_snapshot', type: 'json' })
  calculation_snapshot: Record<string, unknown>;

  @Column({ name: 'review_reason', type: 'text', nullable: true })
  review_reason: string | null;

  @Column({ name: 'reserved_at', type: 'datetime', nullable: true })
  reserved_at: Date | null;

  @Column({
    name: 'invoice_line_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  invoice_line_id: string | null;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  lock_version: number;
}

@Entity('invoice_lines')
@BusinessTable({
  label: 'Lignes de facture',
  description: 'Lignes de facture créées à partir des éléments facturables des dossiers.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_invoice_line_billable_item', ['tenant_id', 'billable_item_id'], {
  unique: true,
})
export class InvoiceLine extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Note : pas de `length` ici — TypeORM aligne le type de la colonne FK sur la
  // PK réferencée (uuid) et MariaDB >= 10.7 refuse `length` sur uuid.
  // Le DDL réel (varchar(36)) est porté par la migration SQL.
  @Column({ name: 'facture_id', type: 'varchar' })
  facture_id: string;

  @ManyToOne(() => Facture, (facture) => facture.lines, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'facture_id' })
  facture: Facture;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ name: 'billable_item_id', type: 'varchar', length: 36 })
  billable_item_id: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  display_order: number;

  @Column({ length: 255 })
  label: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  unit_price: number;

  @Column({ name: 'net_amount', type: 'decimal', precision: 14, scale: 2 })
  net_amount: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 3 })
  tax_rate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 2 })
  tax_amount: number;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 14, scale: 2 })
  gross_amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ name: 'source_snapshot', type: 'json' })
  source_snapshot: Record<string, unknown>;
}
