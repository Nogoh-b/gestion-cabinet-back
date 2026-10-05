// src/modules/payroll/services/hr-notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRole } from 'src/core/enums/user-role.enum';
import { Employee } from '../../agencies/employee/entities/employee.entity';
import { User } from '../../iam/user/entities/user.entity';
import { NotificationType } from '../../notification/enum/notification-type.enum';
import { NotificationService } from '../../notification/notification.service';
import { EmployeeLeave } from '../entities/employee-leave.entity';
import { SalaryAdvance } from '../entities/salary-advance.entity';

/**
 * Émetteur des notifications temps réel du module RH (permissions et avances
 * sur salaire).
 *
 * S'appuie sur le système de notifications existant : `createBulk()` est
 * volontairement la seule méthode utilisée, car c'est la seule qui crée les
 * lignes `user_notifications` — sans elles, la notification n'apparaît jamais
 * dans la liste du destinataire.
 *
 * Destinataires : l'administrateur qui doit agir, ou le demandeur qui attend
 * une décision. L'auteur d'une action n'est jamais notifié de sa propre action
 * (le demandeur est exclu de la diffusion « demande reçue », l'admin ne reçoit
 * rien de la décision qu'il vient de rendre).
 *
 * Aucune méthode ne propage d'erreur : un incident de notification ne doit
 * jamais faire échouer une validation de permission ni un versement d'avance.
 */

/** `user_id` porté par la notification comme émetteur (convention scheduler). */
const SYSTEM_SENDER_ID = 1;

/** La devise est un réglage par cabinet, connu du front uniquement. */
function formatAmount(amount: number | string | null | undefined): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat('fr-FR').format(safe)} FCFA`;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface Payload {
  type: NotificationType;
  title: string;
  content: string;
  data: Record<string, unknown>;
  link: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

@Injectable()
export class HrNotificationsService {
  private readonly logger = new Logger(HrNotificationsService.name);

  constructor(
    private readonly notifications: NotificationService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ── Résolution des destinataires ───────────────────────────────────────────

  /**
   * `user.id` vaut `employee.id` (clé primaire partagée, cf.
   * `@JoinColumn({ name: 'id' })` sur `Employee.user`) : le compte du
   * collaborateur reste donc identifiable même quand l'appelant n'a pas chargé
   * la relation `user`.
   */
  private requesterId(employee?: Employee | null): number | undefined {
    return employee?.user?.id ?? employee?.id ?? undefined;
  }

  /** Administrateurs actifs du cabinet courant (le repository est filtré par tenant). */
  private async adminIds(excludeUserId?: number): Promise<number[]> {
    const admins = await this.userRepo.find({
      where: { role: UserRole.ADMIN, status: 1 },
      select: ['id'],
    });
    return admins
      .map((admin) => admin.id)
      .filter((id) => id !== excludeUserId);
  }

  private displayName(employee?: Employee | null): string {
    return employee?.user?.full_name || employee?.full_name || 'un collaborateur';
  }

  // ── Diffusion ──────────────────────────────────────────────────────────────

  /** Envoie la notification ; journalise et absorbe toute erreur. */
  private async send(userIds: number[], payload: Payload): Promise<void> {
    const recipients = [...new Set(userIds.filter(Boolean))];
    if (recipients.length === 0) return;

    try {
      await this.notifications.createBulk(
        {
          user_ids: recipients,
          type: payload.type,
          title: payload.title,
          content: payload.content,
          data: payload.data,
          link: payload.link,
          priority: payload.priority,
        },
        SYSTEM_SENDER_ID,
      );
    } catch (error) {
      this.logger.warn(
        `Notification ${payload.type} non distribuée à [${recipients.join(', ')}] : ${
          (error as Error).message
        }`,
      );
    }
  }

  // ── Permissions (congés) ───────────────────────────────────────────────────

  /** Un collaborateur dépose une demande : prévient les administrateurs. */
  async leaveRequested(leave: EmployeeLeave): Promise<void> {
    const requester = this.requesterId(leave.employee);
    const admins = await this.adminIds(requester);
    const days = leave.duration_days
      ? ` (${leave.duration_days} jour${leave.duration_days > 1 ? 's' : ''})`
      : '';
    const reason = leave.reason ? ` — motif : ${leave.reason}` : '';

    await this.send(admins, {
      type: NotificationType.EMPLOYEE_LEAVE_REQUESTED,
      title: 'Demande de permission',
      content: `${this.displayName(leave.employee)} demande une permission du ${formatDate(
        leave.start_date,
      )} au ${formatDate(leave.end_date)}${days}${reason}`,
      data: {
        leaveId: leave.id,
        employeeId: leave.employee_id,
        startDate: leave.start_date,
        endDate: leave.end_date,
        durationDays: leave.duration_days,
        reason: leave.reason,
      },
      link: `/gestion-cabinet/employees/${leave.employee_id}/fiche`,
      priority: 'HIGH',
    });
  }

  /**
   * Décision de l'administrateur sur une permission : prévient le demandeur.
   * `status` détermine le libellé, la raison n'est jointe que si elle existe.
   * `actorId` (l'admin qui a décidé) est exclu : personne n'est notifié de sa
   * propre action.
   */
  async leaveDecided(
    leave: EmployeeLeave,
    status: 'approved' | 'rejected' | 'cancelled',
    actorId?: number,
  ): Promise<void> {
    const requester = this.requesterId(leave.employee);
    if (!requester || requester === actorId) return;

    const period = `du ${formatDate(leave.start_date)} au ${formatDate(
      leave.end_date,
    )}`;
    const reason = leave.decision_reason ? ` Motif : ${leave.decision_reason}` : '';

    const [type, title, content] =
      status === 'approved'
        ? [
            NotificationType.EMPLOYEE_LEAVE_APPROVED,
            'Permission validée',
            `Votre permission ${period} a été validée.${reason}`,
          ]
        : status === 'rejected'
          ? [
              NotificationType.EMPLOYEE_LEAVE_REJECTED,
              'Permission refusée',
              `Votre permission ${period} a été refusée.${reason}`,
            ]
          : [
              NotificationType.EMPLOYEE_LEAVE_CANCELLED,
              'Permission annulée',
              `Votre permission ${period} a été annulée.${reason}`,
            ];

    await this.send([requester], {
      type,
      title,
      content,
      data: {
        leaveId: leave.id,
        employeeId: leave.employee_id,
        status,
        reason: leave.decision_reason,
      },
      link: `/gestion-cabinet/employees/${leave.employee_id}/fiche`,
      priority: status === 'approved' ? 'NORMAL' : 'HIGH',
    });
  }

  // ── Avances sur salaire ────────────────────────────────────────────────────

  /** Un collaborateur demande une avance : prévient les administrateurs. */
  async advanceRequested(advance: SalaryAdvance): Promise<void> {
    const requester = this.requesterId(advance.employee);
    const admins = await this.adminIds(requester);
    const reason = advance.reason ? ` — motif : ${advance.reason}` : '';

    await this.send(admins, {
      type: NotificationType.SALARY_ADVANCE_REQUESTED,
      title: 'Demande d\'avance sur salaire',
      content: `${this.displayName(advance.employee)} demande une avance de ${formatAmount(
        advance.amount,
      )}${reason}`,
      data: {
        advanceId: advance.id,
        employeeId: advance.employee_id,
        amount: Number(advance.amount ?? 0),
        reason: advance.reason,
      },
      link: `/gestion-cabinet/employees/${advance.employee_id}/fiche`,
      priority: 'HIGH',
    });
  }

  /** L'administrateur approuve l'avance : prévient le demandeur. */
  async advanceApproved(advance: SalaryAdvance, actorId?: number): Promise<void> {
    const requester = this.requesterId(advance.employee);
    if (!requester || requester === actorId) return;

    await this.send([requester], {
      type: NotificationType.SALARY_ADVANCE_APPROVED,
      title: 'Avance approuvée',
      content: `Votre demande d'avance de ${formatAmount(
        advance.amount,
      )} a été approuvée. Elle peut désormais être versée.`,
      data: {
        advanceId: advance.id,
        employeeId: advance.employee_id,
        amount: Number(advance.amount ?? 0),
      },
      link: `/salary-advances/${advance.id}`,
      priority: 'HIGH',
    });
  }

  /** L'avance a été versée : prévient le demandeur. */
  async advancePaid(advance: SalaryAdvance, actorId?: number): Promise<void> {
    const requester = this.requesterId(advance.employee);
    if (!requester || requester === actorId) return;

    await this.send([requester], {
      type: NotificationType.SALARY_ADVANCE_PAID,
      title: 'Avance versée',
      content: `Votre avance de ${formatAmount(advance.amount)} a été versée${
        advance.payment_date ? ` le ${formatDate(advance.payment_date)}` : ''
      }. Elle sera récupérée sur vos prochaines paies.`,
      data: {
        advanceId: advance.id,
        employeeId: advance.employee_id,
        amount: Number(advance.amount ?? 0),
        paymentDate: advance.payment_date,
      },
      link: `/salary-advances/${advance.id}`,
      priority: 'HIGH',
    });
  }

  /** L'avance est refusée ou annulée : prévient le demandeur. */
  async advanceCancelled(advance: SalaryAdvance, actorId?: number): Promise<void> {
    const requester = this.requesterId(advance.employee);
    if (!requester || requester === actorId) return;

    const reason = advance.cancel_reason ? ` Motif : ${advance.cancel_reason}` : '';

    await this.send([requester], {
      type: NotificationType.SALARY_ADVANCE_CANCELLED,
      title: 'Avance annulée',
      content: `Votre demande d'avance de ${formatAmount(
        advance.amount,
      )} a été annulée.${reason}`,
      data: {
        advanceId: advance.id,
        employeeId: advance.employee_id,
        amount: Number(advance.amount ?? 0),
        reason: advance.cancel_reason,
      },
      link: `/salary-advances/${advance.id}`,
      priority: 'HIGH',
    });
  }
}
