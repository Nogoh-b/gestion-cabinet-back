import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { PayrollPeriod } from './payroll-period.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { PayslipLine } from './payslip-line.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

export enum PayslipStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  PAID = 'paid',
}

@Entity('payslip')
@BusinessTable({
  label: 'Fiches de paie',
  description: 'Fiche de paie individuelle d\'un collaborateur pour une période donnée.',
  icon: '📄',
  category: 'rh',
})
export class Payslip extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la fiche de paie',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: 'Identifiant du collaborateur',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  employee_id: number;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: 'Collaborateur concerné par cette fiche de paie',
    importance: 'high',
    group: 'relation',
  })
  employee: Employee;

  @Column({ type: 'int', name: 'period_id' })
  @BusinessColumn({
    label: 'Période',
    description: 'Identifiant de la période de paie',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  period_id: number;

  @ManyToOne(() => PayrollPeriod, (period) => period.payslips, { nullable: false })
  @JoinColumn({ name: 'period_id' })
  @BusinessColumn({
    label: 'Période',
    description: 'Période de paie associée',
    importance: 'high',
    group: 'relation',
  })
  period: PayrollPeriod;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'gross_amount' })
  @BusinessColumn({
    label: 'Salaire brut',
    description: 'Montant brut avant déductions',
    unit: '€',
    example: '4500.00',
    importance: 'high',
    group: 'financier',
  })
  gross_amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'net_amount' })
  @BusinessColumn({
    label: 'Net à payer',
    description: 'Montant net après déductions et cotisations',
    unit: '€',
    example: '3200.00',
    importance: 'high',
    group: 'financier',
  })
  net_amount: number;

  @Column({ type: 'enum', enum: PayslipStatus, default: PayslipStatus.DRAFT })
  @BusinessColumn({
    label: 'Statut',
    description: "BD: 'draft'=Brouillon, 'validated'=Validée, 'paid'=Payée.",
    importance: 'high',
    group: 'statut',
  })
  status: PayslipStatus;

  @Column({ type: 'date', nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date effective du versement du salaire',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes internes',
    description: 'Commentaires internes sur la fiche de paie',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, name: 'total_employer_charges' })
  @BusinessColumn({
    label: 'Charges patronales',
    description: 'Total des cotisations à la charge de l\'employeur (hors net)',
    unit: 'XAF',
    importance: 'medium',
    group: 'financier',
  })
  total_employer_charges: number;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Instantané de calcul',
    description: 'Copie figée des montants et du barème au moment de la validation (auditabilité légale)',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  snapshot: Record<string, any> | null;

  @OneToMany(() => PayslipLine, (line) => line.payslip)
  lines: PayslipLine[];

}
