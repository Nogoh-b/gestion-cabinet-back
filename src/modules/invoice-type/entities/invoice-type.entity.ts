// invoice-type.entity.ts
import { Expose } from 'class-transformer';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Unique
} from 'typeorm';


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

@SharedAcrossTenants()
@Entity('invoice_types')
@BusinessTable({
  label: "Types d'honoraires",
  description: 'Catégories d\'honoraires et de frais facturables aux clients.',
  icon: '💰',
  category: 'finance'
})
@Unique(['tenant_id', 'code'])
export class InvoiceType extends TenantEntity {
  @PrimaryGeneratedColumn()
  @Expose()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du type',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique du type d\'honoraire',
    example: 'HON_FIXE, HON_HORAIRE, FRAIS_DIVERS',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom du type d\'honoraire',
    example: 'Honoraires forfaitaires, Honoraires horaires, Frais de dossier',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée du type d\'honoraire',
    importance: 'medium',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: InvoiceTypeCategory,
    default: InvoiceTypeCategory.LEGAL_FEES
  })
  @Expose()
  @BusinessColumn({
    label: 'Catégorie',
    description: "BD: 'legal_fees', 'expenses', 'advance', 'settlement', 'other'.",
    importance: 'high',
    group: 'classification'
  })
  category: InvoiceTypeCategory;

  @Column({
    type: 'enum',
    enum: TaxRate,
    default: TaxRate.STANDARD
  })
  @Expose()
  @BusinessColumn({
    label: 'Taux TVA par défaut',
    description: 'BD: 0=ZERO, 5.5=REDUCED, 10=INTERMEDIATE, 20=STANDARD. En SQL utiliser le nombre.',
    unit: '%',
    format: 'percentage',
    importance: 'high',
    group: 'financier'
  })
  default_tax_rate: TaxRate;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Facturable',
    description: 'True = ce type peut être facturé au client',
    importance: 'medium',
    group: 'règles'
  })
  is_billable: boolean;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Nécessite approbation',
    description: 'True = nécessite une validation avant facturation',
    importance: 'medium',
    group: 'règles'
  })
  requires_approval: boolean;

  @Column({ default: 30 })
  @Expose()
  @BusinessColumn({
    label: 'Délai paiement par défaut',
    description: 'Nombre de jours pour le paiement',
    unit: 'jours',
    importance: 'medium',
    group: 'règles'
  })
  default_payment_days: number;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Actif',
    description: 'True = type actif et utilisable',
    importance: 'high',
    group: 'état'
  })
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Informations supplémentaires',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
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

}
