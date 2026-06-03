import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { ExpenseLine } from './expense-line.entity';

export enum ExpenseReportStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REIMBURSED = 'reimbursed',
}

@Entity('expense_report')
@BusinessTable({
  label: 'Notes de frais',
  description: 'Dépenses avancées par les collaborateurs, à rembourser.',
  icon: '💳',
  category: 'rh',
})
export class ExpenseReport extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la note de frais',
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
    description: 'Collaborateur ayant engagé les dépenses',
    importance: 'high',
    group: 'relation',
  })
  employee: Employee;

  @Column({ type: 'varchar', length: 255 })
  @BusinessColumn({
    label: 'Objet',
    description: 'Motif de la note de frais',
    example: 'Déplacement Tribunal Commerce - Dossier #123',
    importance: 'high',
    group: 'identification',
  })
  title: string;

  @Column({ type: 'enum', enum: ExpenseReportStatus, default: ExpenseReportStatus.DRAFT })
  @BusinessColumn({
    label: 'Statut',
    description: 'Brouillon, soumise, approuvée, rejetée, remboursée',
    importance: 'high',
    group: 'statut',
  })
  status: ExpenseReportStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_amount' })
  @BusinessColumn({
    label: 'Montant total',
    description: 'Somme des lignes de dépenses',
    unit: '€',
    example: '245.50',
    importance: 'high',
    group: 'financier',
  })
  total_amount: number;

  @Column({ type: 'date', name: 'submission_date' })
  @BusinessColumn({
    label: 'Date de soumission',
    description: 'Date à laquelle la note a été soumise',
    format: 'date',
    example: '2026-04-10',
    importance: 'medium',
    group: 'dates',
  })
  submission_date: Date;

  @Column({ type: 'int', nullable: true, name: 'approved_by_id' })
  @BusinessColumn({
    label: 'Validé par',
    description: 'Identifiant du validateur',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  approved_by_id: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  @BusinessColumn({
    label: 'Validé par',
    description: 'Responsable ayant validé la note de frais',
    importance: 'medium',
    group: 'relation',
  })
  approved_by: Employee;

  @Column({ type: 'date', nullable: true, name: 'reimbursement_date' })
  @BusinessColumn({
    label: 'Date de remboursement',
    description: 'Date effective du remboursement',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  reimbursement_date: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Commentaire',
    description: 'Commentaire du validateur ou du collaborateur',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @OneToMany(() => ExpenseLine, (line) => line.expense_report)
  lines: ExpenseLine[];

}