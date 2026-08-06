import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PayrollPeriod } from './payroll-period.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { PayslipLine } from './payslip-line.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';

export enum PayslipStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  PAID = 'paid',
}

export enum PayslipPaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  MOBILE_MONEY = 'mobile_money',
  CHECK = 'check',
  OTHER = 'other',
}

@Entity('payslip')
@Index('UQ_payslip_tenant_employee_period', [
  'tenant_id',
  'employee_id',
  'period_id',
], { unique: true })
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

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'gross_amount' })
  @BusinessColumn({
    label: 'Salaire brut',
    description: 'Montant brut avant déductions',
    unit: '€',
    example: '4500.00',
    importance: 'high',
    group: 'financier',
  })
  gross_amount: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'net_amount' })
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

  @Column({ type: 'datetime', precision: 6, nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date effective du versement du salaire',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date | null;

  @Column({
    type: 'enum',
    enum: PayslipPaymentMethod,
    nullable: true,
    name: 'payment_method',
  })
  payment_method: PayslipPaymentMethod | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'payment_reference',
  })
  payment_reference: string | null;

  @Column({ type: 'int', nullable: true, name: 'prepared_by_id' })
  prepared_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'prepared_by_id' })
  prepared_by: User | null;

  @Column({ type: 'int', nullable: true, name: 'validated_by_id' })
  validated_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'validated_by_id' })
  validated_by: User | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    name: 'validated_at',
  })
  validated_at: Date | null;

  @Column({ type: 'int', nullable: true, name: 'paid_by_id' })
  paid_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'paid_by_id' })
  paid_by: User | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes internes',
    description: 'Commentaires internes sur la fiche de paie',
    importance: 'low',
    group: 'audit',
  })
  notes: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true, name: 'total_employer_charges' })
  @BusinessColumn({
    label: 'Charges patronales',
    description: 'Total des cotisations à la charge de l\'employeur (hors net)',
    unit: 'XAF',
    importance: 'medium',
    group: 'financier',
  })
  total_employer_charges: number | null;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Instantané de calcul',
    description: 'Copie figée des montants et du barème au moment de la validation (auditabilité légale)',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  snapshot: Record<string, any> | null;

  @Column({ type: 'json', nullable: true, name: 'contribution_snapshot' })
  contribution_snapshot: Array<Record<string, unknown>> | null;

  @OneToMany(() => PayslipLine, (line) => line.payslip)
  lines: PayslipLine[];

}
