import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  BusinessTable,
  BusinessColumn,
} from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

/**
 * Cycle de vie d'une demande de permission (congé).
 *
 *   pending → approved
 *      ├────→ rejected   (refus motivé de l'administrateur)
 *      └────→ cancelled  (annulation motivée, avant ou après validation)
 */
export enum EmployeeLeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/**
 * Permission (congé) demandée par un collaborateur depuis son profil, puis
 * validée, refusée ou annulée par l'administrateur du cabinet depuis la fiche
 * du collaborateur. Les dates restent modifiables tant que la demande n'a pas
 * été tranchée, ce qui permet à l'administrateur d'ajuster la période avant
 * de valider.
 */
@Entity('employee_leave')
@BusinessTable({
  label: 'Permissions (congés)',
  description:
    "Demande de permission d'un collaborateur : période, motif et décision de l'administrateur.",
  icon: '🌴',
  category: 'rh',
})
export class EmployeeLeave extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la demande',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: 'Identifiant du collaborateur demandeur',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  employee_id: number;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  @BusinessColumn({
    label: 'Collaborateur',
    description: 'Collaborateur à l’origine de la demande',
    importance: 'high',
    group: 'relation',
  })
  employee: Employee;

  @Column({ type: 'date', name: 'start_date' })
  @BusinessColumn({
    label: 'Date de début',
    description: 'Premier jour de la permission',
    format: 'date',
    importance: 'high',
    group: 'dates',
  })
  start_date: Date;

  @Column({ type: 'date', name: 'end_date' })
  @BusinessColumn({
    label: 'Date de fin',
    description: 'Dernier jour de la permission (inclus)',
    format: 'date',
    importance: 'high',
    group: 'dates',
  })
  end_date: Date;

  @Column({ type: 'text' })
  @BusinessColumn({
    label: 'Raison',
    description: 'Motif invoqué par le collaborateur',
    importance: 'high',
    group: 'motif',
  })
  reason: string;

  @Column({
    type: 'enum',
    enum: EmployeeLeaveStatus,
    default: EmployeeLeaveStatus.PENDING,
  })
  @BusinessColumn({
    label: 'Statut',
    description:
      "BD: 'pending'=En attente, 'approved'=Validée, 'rejected'=Refusée, 'cancelled'=Annulée.",
    importance: 'high',
    group: 'statut',
  })
  status: EmployeeLeaveStatus;

  @Column({ type: 'text', nullable: true, name: 'decision_reason' })
  @BusinessColumn({
    label: 'Motif de la décision',
    description:
      "Raison du refus ou de l'annulation, saisie par l'administrateur",
    importance: 'medium',
    group: 'motif',
  })
  decision_reason: string;

  @Column({ type: 'int', nullable: true, name: 'decided_by' })
  @BusinessColumn({
    label: 'Décidé par',
    description: "Identifiant de l'utilisateur ayant tranché la demande",
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  decided_by: number;

  @Column({ type: 'datetime', nullable: true, name: 'decided_at' })
  @BusinessColumn({
    label: 'Date de décision',
    description: 'Horodatage de la validation, du refus ou de l’annulation',
    format: 'date',
    importance: 'low',
    group: 'audit',
  })
  decided_at: Date;

  /** Durée de la permission en jours calendaires, bornes incluses. */
  get duration_days(): number {
    if (!this.start_date || !this.end_date) return 0;
    const start = new Date(this.start_date).getTime();
    const end = new Date(this.end_date).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
    return Math.round((end - start) / 86_400_000) + 1;
  }
}
