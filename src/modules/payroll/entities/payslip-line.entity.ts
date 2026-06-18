import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Payslip } from './payslip.entity';
import { Dossier } from '../../dossiers/entities/dossier.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';

export enum PayslipLineType {
  BASE_SALARY = 'base_salary',
  BONUS = 'bonus',
  INTERNAL_COMMISSION = 'internal_commission',
  DEDUCTION = 'deduction',
  ADVANCE_RECOVERY = 'advance_recovery',
  BENEFIT = 'benefit',
  OVERTIME = 'overtime',
}

@Entity('payslip_line')
@BusinessTable({
  label: 'Lignes de fiche de paie',
  description: 'Chaque ligne compose le bulletin : salaire de base, primes, commissions internes, retenues, avantages.',
  icon: '📝',
  category: 'rh',
})
export class PayslipLine extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la ligne',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'payslip_id' })
  @BusinessColumn({
    label: 'Fiche de paie',
    description: 'Identifiant de la fiche de paie parente',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  payslip_id: number;

  @ManyToOne(() => Payslip, (payslip) => payslip.lines, { nullable: false })
  @JoinColumn({ name: 'payslip_id' })
  @BusinessColumn({
    label: 'Fiche de paie',
    description: 'Fiche de paie à laquelle cette ligne appartient',
    importance: 'high',
    group: 'relation',
  })
  payslip: Payslip;

  @Column({ type: 'enum', enum: PayslipLineType, name: 'line_type' })
  @BusinessColumn({
    label: 'Type de ligne',
    description: 'Salaire de base, prime, commission interne, retenue, avantage, heure supplémentaire',
    importance: 'high',
    group: 'identification',
  })
  line_type: PayslipLineType;

  @Column({ type: 'varchar', length: 255 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Description de la ligne sur le bulletin',
    example: 'Salaire de base - Mars 2026',
    importance: 'high',
    group: 'identification',
  })
  label: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  @BusinessColumn({
    label: 'Montant',
    description: 'Montant de la ligne (positif = gain, négatif = retenue)',
    unit: '€',
    example: '4500.00',
    importance: 'high',
    group: 'financier',
  })
  amount: number;

  @Column({ type: 'tinyint', default: 1, name: 'is_taxable' })
  @BusinessColumn({
    label: 'Imposable',
    description: 'True = soumis à l\'impôt, False = non imposable',
    importance: 'medium',
    group: 'financier',
  })
  is_taxable: boolean;

  @Column({ type: 'int', nullable: true, name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier source',
    description: 'Identifiant du dossier ayant généré la commission (si applicable)',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  dossier_id: number;

  @ManyToOne(() => Dossier, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier source',
    description: 'Dossier à l\'origine de la commission interne',
    importance: 'medium',
    group: 'relation',
  })
  dossier: Dossier;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @BusinessColumn({
    label: 'Détail',
    description: 'Précision sur le calcul (ex: "10% des honoraires du dossier #123")',
    example: '10% des honoraires HT du dossier DOS-2026-015',
    importance: 'low',
    group: 'audit',
  })
  notes: string;
}