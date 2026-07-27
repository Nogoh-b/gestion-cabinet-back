import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { ExpenseReport } from './expense-report.entity';
import { Dossier } from '../../dossiers/entities/dossier.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

export enum ExpenseCategory {
  TRANSPORT = 'transport',
  ACCOMMODATION = 'accommodation',
  MEAL = 'meal',
  BAILIFF = 'bailiff',
  COURT_FEES = 'court_fees',
  OFFICE_SUPPLIES = 'office_supplies',
  OTHER = 'other',
}

@Entity('expense_line')
@BusinessTable({
  label: 'Lignes de note de frais',
  description: 'Détail de chaque dépense dans une note de frais.',
  icon: '📎',
  category: 'rh',
})
export class ExpenseLine extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la ligne',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'expense_report_id' })
  @BusinessColumn({
    label: 'Note de frais',
    description: 'Identifiant de la note de frais parente',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  expense_report_id: number;

  @ManyToOne(() => ExpenseReport, (report) => report.lines, { nullable: false })
  @JoinColumn({ name: 'expense_report_id' })
  @BusinessColumn({
    label: 'Note de frais',
    description: 'Note de frais parente',
    importance: 'high',
    group: 'relation',
  })
  expense_report: ExpenseReport;

  @Column({ type: 'date', name: 'expense_date' })
  @BusinessColumn({
    label: 'Date de la dépense',
    description: 'Date à laquelle la dépense a été engagée',
    format: 'date',
    example: '2026-04-08',
    importance: 'high',
    group: 'dates',
  })
  expense_date: Date;

  @Column({ type: 'varchar', length: 500 })
  @BusinessColumn({
    label: 'Description',
    description: 'Détail de la dépense',
    example: 'Train Paris-Lyon A/R',
    importance: 'high',
    group: 'identification',
  })
  description: string;

  @Column({ type: 'enum', enum: ExpenseCategory })
  @BusinessColumn({
    label: 'Catégorie',
    description: "BD: 'transport', 'accommodation', 'meal', 'bailiff', 'court_fees', 'office_supplies', 'other'.",
    importance: 'high',
    group: 'identification',
  })
  category: ExpenseCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'amount_ht' })
  @BusinessColumn({
    label: 'Montant HT',
    description: 'Montant hors taxes',
    unit: '€',
    example: '120.00',
    importance: 'high',
    group: 'financier',
  })
  amount_ht: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, name: 'tax_rate' })
  @BusinessColumn({
    label: 'Taux TVA',
    description: 'Taux de TVA appliqué',
    unit: '%',
    example: '20.00',
    importance: 'medium',
    group: 'fiscal',
  })
  tax_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'amount_ttc' })
  @BusinessColumn({
    label: 'Montant TTC',
    description: 'Montant total TTC',
    unit: '€',
    example: '144.00',
    importance: 'high',
    group: 'financier',
  })
  amount_ttc: number;

  @Column({ type: 'tinyint', default: 0, name: 'is_rebillable' })
  @BusinessColumn({
    label: 'Refacturable au client',
    description: 'BD: 1=Refacturable au client, 0=Non refacturable.',
    importance: 'medium',
    group: 'financier',
  })
  is_rebillable: boolean;

  @Column({ type: 'int', nullable: true, name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier associé',
    description: 'Identifiant du dossier si refacturable',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  dossier_id: number;

  @ManyToOne(() => Dossier, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier associé',
    description: 'Dossier client lié à cette dépense',
    importance: 'medium',
    group: 'relation',
  })
  dossier: Dossier;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'attachment_url' })
  @BusinessColumn({
    label: 'Justificatif',
    description: 'Lien vers le justificatif scanné (ticket, facture)',
    importance: 'medium',
    group: 'document',
  })
  attachment_url: string;
}
