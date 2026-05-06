import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Payslip } from './payslip.entity';

export enum PayrollPeriodStatus {
  DRAFT = 'draft',
  VALIDATED = 'validated',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('payroll_period')
@BusinessTable({
  label: 'Périodes de paie',
  description: 'Définit les périodes de paie mensuelles pour le cabinet.',
  icon: '📅',
  category: 'rh',
})
export class PayrollPeriod {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la période de paie',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 100 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Ex: "Paie Mars 2026"',
    example: 'Paie Mars 2026',
    importance: 'high',
    group: 'identification',
  })
  label: string;

  @Column({ type: 'date', name: 'start_date' })
  @BusinessColumn({
    label: 'Date début',
    description: 'Premier jour de la période de paie',
    format: 'date',
    example: '2026-03-01',
    importance: 'high',
    group: 'dates',
  })
  start_date: Date;

  @Column({ type: 'date', name: 'end_date' })
  @BusinessColumn({
    label: 'Date fin',
    description: 'Dernier jour de la période de paie',
    format: 'date',
    example: '2026-03-31',
    importance: 'high',
    group: 'dates',
  })
  end_date: Date;

  @Column({ type: 'enum', enum: PayrollPeriodStatus, default: PayrollPeriodStatus.DRAFT })
  @BusinessColumn({
    label: 'Statut',
    description: 'Brouillon, validée, payée, annulée',
    importance: 'high',
    group: 'statut',
  })
  status: PayrollPeriodStatus;

  @Column({ type: 'int', nullable: true, name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Identifiant de l\'agence concernée',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  branch_id: number;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Agence concernée par cette période de paie',
    importance: 'medium',
    group: 'relation',
  })
  branch: Branch;

  @OneToMany(() => Payslip, (payslip) => payslip.period)
  payslips: Payslip[];

  @CreateDateColumn({ name: 'created_at' })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date de création dans le système',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @BusinessColumn({
    label: 'Date de modification',
    description: 'Date de dernière modification',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  updated_at: Date;
}