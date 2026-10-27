import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Employee } from '../agencies/employee/entities/employee.entity';
import {
  EmployeeLeave,
  EmployeeLeaveStatus,
} from './entities/employee-leave.entity';
import { CreateEmployeeLeaveDto } from './dto/create-employee-leave.dto';
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';
import { HrNotificationsService } from './services/hr-notifications.service';

/**
 * Permissions (congés) des collaborateurs.
 *
 * Cycle de vie : pending → approved | rejected | cancelled.
 * Les dates et le motif ne sont modifiables que tant que la demande est
 * `pending` : l'administrateur peut ainsi ajuster la période avant de valider,
 * mais une décision rendue n'est plus réécrite silencieusement.
 */
@Injectable()
export class EmployeeLeavesService extends BaseServiceV1<EmployeeLeave> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(EmployeeLeave)
    protected repository: Repository<EmployeeLeave>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    private readonly hrNotifications: HrNotificationsService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reason', 'decision_reason'],
      exactMatchFields: ['id', 'employee_id', 'status'],
      dateRangeFields: ['start_date', 'end_date', 'created_at'],
      relationFields: ['employee', 'employee.user'],
    };
  }

  /** Valide la cohérence de la période et renvoie les dates normalisées. */
  private parsePeriod(
    startDate: string,
    endDate: string,
  ): { start: Date; end: Date } {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(
        'Les dates de la permission sont invalides.',
      );
    }
    if (end < start) {
      throw new BadRequestException(
        'La date de fin ne peut pas précéder la date de début.',
      );
    }
    return { start, end };
  }

  async create(
    dto: CreateEmployeeLeaveDto,
    employeeId?: number,
  ): Promise<EmployeeLeave> {
    const targetId = employeeId ?? dto.employee_id;
    if (!targetId) {
      throw new BadRequestException(
        'Le collaborateur concerné est obligatoire.',
      );
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: targetId },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');

    const { start, end } = this.parsePeriod(dto.start_date, dto.end_date);

    const entity = this.repository.create({
      employee_id: targetId,
      start_date: start,
      end_date: end,
      reason: dto.reason,
      // Une demande self-service est toujours « en attente » : seul un appel
      // administrateur peut pré-positionner un autre statut.
      status: employeeId
        ? EmployeeLeaveStatus.PENDING
        : (dto.status ?? EmployeeLeaveStatus.PENDING),
    });
    entity.employee = employee;

    const saved = await this.repository.save(entity);
    const created = await this.findOne(saved.id);

    // Seule une demande en attente appelle une décision : elle est signalée
    // aux administrateurs. Une permission créée déjà tranchée par l'admin
    // (rare) ne génère donc aucun notification.
    if (created.status === EmployeeLeaveStatus.PENDING) {
      await this.hrNotifications.leaveRequested(created);
    }

    return created;
  }

  findAll(): Promise<EmployeeLeave[]> {
    return this.repository.find({
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<EmployeeLeave> {
    const leave = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'employee.user'],
    });
    if (!leave) throw new NotFoundException('Permission non trouvée');
    return leave;
  }

  findByEmployee(employee_id: number): Promise<EmployeeLeave[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  // ── Modification (avant décision) ──────────────────────────────────────────

  async update(
    id: number,
    dto: UpdateEmployeeLeaveDto,
  ): Promise<EmployeeLeave> {
    const leave = await this.findOne(id);
    if (leave.status !== EmployeeLeaveStatus.PENDING) {
      throw new ForbiddenException(
        'Seule une permission en attente peut être modifiée.',
      );
    }

    const nextStart = dto.start_date ?? (leave.start_date as unknown as string);
    const nextEnd = dto.end_date ?? (leave.end_date as unknown as string);
    if (dto.start_date !== undefined || dto.end_date !== undefined) {
      const { start, end } = this.parsePeriod(
        String(nextStart),
        String(nextEnd),
      );
      leave.start_date = start;
      leave.end_date = end;
    }
    if (dto.reason !== undefined) leave.reason = dto.reason;

    await this.repository.save(leave);
    return this.findOne(id);
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  /** Valide une demande en attente. */
  async approve(
    id: number,
    decidedBy?: number,
    comment?: string,
  ): Promise<EmployeeLeave> {
    const leave = await this.findOne(id);
    if (leave.status !== EmployeeLeaveStatus.PENDING) {
      throw new BadRequestException(
        'Seule une permission en attente peut être validée.',
      );
    }
    leave.status = EmployeeLeaveStatus.APPROVED;
    if (comment) leave.decision_reason = comment;
    if (decidedBy) leave.decided_by = decidedBy;
    leave.decided_at = new Date();
    await this.repository.save(leave);
    const approved = await this.findOne(id);
    await this.hrNotifications.leaveDecided(approved, 'approved', decidedBy);
    return approved;
  }

  /** Refuse une demande en attente ; la raison est obligatoire. */
  async reject(
    id: number,
    reason: string,
    decidedBy?: number,
  ): Promise<EmployeeLeave> {
    const leave = await this.findOne(id);
    if (leave.status !== EmployeeLeaveStatus.PENDING) {
      throw new BadRequestException(
        'Seule une permission en attente peut être refusée.',
      );
    }
    leave.status = EmployeeLeaveStatus.REJECTED;
    leave.decision_reason = reason;
    if (decidedBy) leave.decided_by = decidedBy;
    leave.decided_at = new Date();
    await this.repository.save(leave);
    const rejected = await this.findOne(id);
    await this.hrNotifications.leaveDecided(rejected, 'rejected', decidedBy);
    return rejected;
  }

  /** Annule une demande en attente ou déjà validée ; la raison est obligatoire. */
  async cancel(
    id: number,
    reason: string,
    decidedBy?: number,
  ): Promise<EmployeeLeave> {
    const leave = await this.findOne(id);
    if (leave.status === EmployeeLeaveStatus.CANCELLED) {
      throw new BadRequestException('Permission déjà annulée.');
    }
    if (leave.status === EmployeeLeaveStatus.REJECTED) {
      throw new BadRequestException(
        "Une permission refusée n'a pas à être annulée.",
      );
    }
    leave.status = EmployeeLeaveStatus.CANCELLED;
    leave.decision_reason = reason;
    if (decidedBy) leave.decided_by = decidedBy;
    leave.decided_at = new Date();
    await this.repository.save(leave);
    const cancelled = await this.findOne(id);
    await this.hrNotifications.leaveDecided(cancelled, 'cancelled', decidedBy);
    return cancelled;
  }

  async remove(id: number): Promise<void> {
    const leave = await this.findOne(id);
    if (leave.status === EmployeeLeaveStatus.APPROVED) {
      throw new ForbiddenException(
        'Une permission validée ne peut pas être supprimée — annulez-la avec un motif.',
      );
    }
    await this.repository.softDelete(id);
  }
}
