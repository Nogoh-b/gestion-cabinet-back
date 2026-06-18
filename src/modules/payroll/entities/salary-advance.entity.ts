import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

/**
 * Cycle de vie d'une avance sur salaire.
 *
 *   pending → approved → paid → recovered
 *                  └──────────→ cancelled (avant versement)
 *
 * - `paid`      : l'avance est versée → écriture comptable 425 / 512.
 * - `recovered` : l'avance a été entièrement retenue sur une (des) paie(s).
 */
export enum SalaryAdvanceStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PAID = 'paid',
  RECOVERED = 'recovered',
  CANCELLED = 'cancelled',
}

/**
 * Avance sur salaire accordée à un collaborateur, indépendante du bulletin
 * mensuel. Une avance versée crée une créance (compte 425) qui est ensuite
 * automatiquement récupérée sur la (les) paie(s) suivante(s) du collaborateur.
 *
 * Un collaborateur peut cumuler PLUSIEURS avances en cours ; le reste à
 * récupérer global est la somme de (amount − recovered_amount) des avances
 * versées non encore soldées.
 */
@Entity('salary_advance')
@BusinessTable({
  label: 'Avances sur salaire',
  description: "Avance sur salaire accordée à un collaborateur, récupérée automatiquement sur ses paies.",
  icon: '💸',
  category: 'rh',
})
export class SalaryAdvance extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: "Identifiant unique de l'avance",
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: 'Identifiant du collaborateur bénéficiaire',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  employee_id: number;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: "Collaborateur bénéficiaire de l'avance",
    importance: 'high',
    group: 'relation',
  })
  employee: Employee;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'amount' })
  @BusinessColumn({
    label: "Montant de l'avance",
    description: "Montant accordé au collaborateur",
    unit: 'XAF',
    example: '150000.00',
    importance: 'high',
    group: 'financier',
  })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'recovered_amount', default: 0 })
  @BusinessColumn({
    label: 'Montant déjà récupéré',
    description: "Part de l'avance déjà retenue sur des paies (reste à récupérer = montant − ce champ)",
    unit: 'XAF',
    example: '50000.00',
    importance: 'medium',
    group: 'financier',
  })
  recovered_amount: number;

  @Column({ type: 'date', name: 'date_granted' })
  @BusinessColumn({
    label: "Date d'octroi",
    description: "Date à laquelle l'avance est accordée",
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  date_granted: Date;

  @Column({ type: 'enum', enum: SalaryAdvanceStatus, default: SalaryAdvanceStatus.PENDING })
  @BusinessColumn({
    label: 'Statut',
    description: 'Demandée, approuvée, versée, récupérée, annulée',
    importance: 'high',
    group: 'statut',
  })
  status: SalaryAdvanceStatus;

  @Column({ type: 'date', nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de versement',
    description: "Date effective du versement de l'avance",
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Motif',
    description: "Motif ou commentaire interne sur l'avance",
    importance: 'low',
    group: 'audit',
  })
  reason: string;
}
