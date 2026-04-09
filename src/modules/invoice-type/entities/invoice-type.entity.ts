import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Facture } from 'src/modules/facture/entities/facture.entity';

export enum InvoiceTypeCategory {
  LEGAL_FEES = 'legal_fees',
  EXPENSES = 'expenses',
  ADVANCE = 'advance',
  SETTLEMENT = 'settlement',
  OTHER = 'other'
}

export enum TaxRate {
  ZERO = 0,
  REDUCED = 5.5,
  INTERMEDIATE = 10,
  STANDARD = 20
}

@Entity('invoice_types')
export class InvoiceType {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column({ unique: true })
  @Expose()
  code: string;

  @Column()
  @Expose()
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  description: string;

  @Column({
    type: 'enum',
    enum: InvoiceTypeCategory,
    default: InvoiceTypeCategory.LEGAL_FEES
  })
  @Expose()
  category: InvoiceTypeCategory;

  @Column({
    type: 'enum',
    enum: TaxRate,
    default: TaxRate.STANDARD
  })
  @Expose()
  default_tax_rate: TaxRate;

  @Column({ default: true })
  @Expose()
  is_billable: boolean;

  @Column({ default: true })
  @Expose()
  requires_approval: boolean;

  @Column({ default: 30 })
  @Expose()
  default_payment_days: number;

  @Column({ default: true })
  @Expose()
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  metadata: {
    accounting_code?: string;
    default_unit?: 'hour' | 'day' | 'unit' | 'fixed';
    default_price?: number;
    vat_exempt?: boolean;
    legal_basis?: string;
  };

  @OneToMany(() => Facture, facture => facture.invoice_type)
  @Expose()
  invoices: Facture[];

  @CreateDateColumn()
  @Expose()
  created_at: Date;

  @UpdateDateColumn()
  @Expose()
  updated_at: Date;
}