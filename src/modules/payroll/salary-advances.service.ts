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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import { Employee } from '../agencies/employee/entities/employee.entity';
import {
  SalaryAdvance,
  SalaryAdvanceStatus,
} from './entities/salary-advance.entity';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import { HrNotificationsService } from './services/hr-notifications.service';

/**
 * Gestion des avances sur salaire (entité autonome, découplée du bulletin).
 *
 * Cycle de vie : pending → approved → paid → recovered (ou cancelled avant
 * versement). Le versement (`paid`) émet `salary_advance.payee` qui déclenche
 * l'écriture comptable 425 / 512. La récupération (incrément de
 * `recovered_amount` + passage à `recovered`) est pilotée par la paie
 * (PayslipsService.realizeAdvanceRecovery).
 */
@Injectable()
export class SalaryAdvancesService extends BaseServiceV1<SalaryAdvance> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(SalaryAdvance)
    protected repository: Repository<SalaryAdvance>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    private readonly eventEmitter: EventEmitter2,
    private readonly hrNotifications: HrNotificationsService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reason'],
      relationFields: ['employee', 'employee.user'],
    };
  }

  /**
   * Crée une avance. `employeeId` force le bénéficiaire (demande self-service
   * depuis le profil) : dans ce cas le statut demandé est ignoré et l'avance
   * part toujours en « pending », pour qu'elle passe par la validation.
   */
  async create(
    dto: CreateSalaryAdvanceDto,
    employeeId?: number,
  ): Promise<SalaryAdvance> {
    const targetId = employeeId ?? dto.employee_id;
    if (!targetId) {
      throw new BadRequestException(
        'Le collaborateur bénéficiaire est obligatoire.',
      );
    }
    const employee = await this.employeeRepo.findOne({
      where: { id: targetId },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');

    if (Number(dto.amount) <= 0) {
      throw new BadRequestException(
        "Le montant de l'avance doit être strictement positif.",
      );
    }
    // Garde-fou métier : une avance ne peut excéder le salaire mensuel.
    const salary = employee.salary != null ? Number(employee.salary) : null;
    if (salary != null && salary > 0 && Number(dto.amount) > salary) {
      throw new BadRequestException(
        "L'avance ne peut pas dépasser le salaire de l'employé.",
      );
    }

    const entity = this.repository.create({
      employee_id: targetId,
      amount: dto.amount,
      reason: dto.reason,
      date_granted: dto.date_granted ? new Date(dto.date_granted) : new Date(),
      status: SalaryAdvanceStatus.PENDING,
      recovered_amount: 0,
    });
    entity.employee = employee;
    const saved = await this.repository.save(entity);

    // Honorer le statut demandé via les transitions officielles. Une demande
    // self-service reste en attente quoi qu'il arrive.
    const requested = employeeId ? undefined : dto.status;
    if (requested === SalaryAdvanceStatus.APPROVED) {
      await this.approve(saved.id);
    } else if (requested === SalaryAdvanceStatus.PAID) {
      await this.approve(saved.id);
      await this.pay(saved.id);
    }

    const created = await this.findOne(saved.id);

    // Seule une avance en attente appelle une décision : elle est signalée
    // aux administrateurs. Une avance créée déjà validée ou versée par l'admin
    // notifie le collaborateur via les transitions ci-dessus.
    if (created.status === SalaryAdvanceStatus.PENDING) {
      await this.hrNotifications.advanceRequested(created);
    }

    return created;
  }

  findAll(): Promise<SalaryAdvance[]> {
    return this.repository.find({
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SalaryAdvance> {
    const advance = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'employee.user'],
    });
    if (!advance) throw new NotFoundException('Avance sur salaire non trouvée');
    return advance;
  }

  findByEmployee(employee_id: number): Promise<SalaryAdvance[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  /**
   * Approuve une avance demandée (pending → approved).
   * `actorId` est l'administrateur qui décide : il n'est pas notifié de sa
   * propre décision.
   */
  async approve(id: number, actorId?: number): Promise<SalaryAdvance> {
    const advance = await this.findOne(id);
    if (advance.status !== SalaryAdvanceStatus.PENDING) {
      throw new BadRequestException(
        'Seule une avance « demandée » peut être approuvée.',
      );
    }
    advance.status = SalaryAdvanceStatus.APPROVED;
    await this.repository.save(advance);
    const approved = await this.findOne(id);
    await this.hrNotifications.advanceApproved(approved, actorId);
    return approved;
  }

  /**
   * Verse l'avance (→ paid) et déclenche la comptabilisation 425/512.
   * Accepte une avance demandée ou approuvée (raccourci).
   */
  async pay(id: number, actorId?: number): Promise<SalaryAdvance> {
    const advance = await this.findOne(id);
    if (advance.status === SalaryAdvanceStatus.PAID) {
      throw new BadRequestException('Avance déjà versée.');
    }
    if (advance.status === SalaryAdvanceStatus.RECOVERED) {
      throw new BadRequestException('Avance déjà récupérée.');
    }
    if (advance.status === SalaryAdvanceStatus.CANCELLED) {
      throw new BadRequestException('Avance annulée : versement impossible.');
    }
    advance.status = SalaryAdvanceStatus.PAID;
    advance.payment_date = new Date();
    await this.repository.save(advance);
    const full = await this.findOne(id);
    this.eventEmitter.emit('salary_advance.payee', full);
    await this.hrNotifications.advancePaid(full, actorId);
    return full;
  }

  /**
   * Annule (ou refuse) une avance non encore versée, avec motif facultatif.
   * `actorId` est l'administrateur qui décide (non notifié de sa décision).
   */
  async cancel(
    id: number,
    reason?: string,
    actorId?: number,
  ): Promise<SalaryAdvance> {
    const advance = await this.findOne(id);
    if (
      advance.status === SalaryAdvanceStatus.PAID ||
      advance.status === SalaryAdvanceStatus.RECOVERED
    ) {
      throw new ForbiddenException(
        'Une avance versée ne peut pas être annulée (impact comptable).',
      );
    }
    advance.status = SalaryAdvanceStatus.CANCELLED;
    if (reason) advance.cancel_reason = reason;
    await this.repository.save(advance);
    const cancelled = await this.findOne(id);
    await this.hrNotifications.advanceCancelled(cancelled, actorId);
    return cancelled;
  }

  async update(
    id: number,
    dto: UpdateSalaryAdvanceDto,
    actorId?: number,
  ): Promise<SalaryAdvance> {
    const advance = await this.findOne(id);
    if (
      advance.status !== SalaryAdvanceStatus.PENDING &&
      advance.status !== SalaryAdvanceStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Seule une avance non versée est modifiable.',
      );
    }
    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({
        where: { id: dto.employee_id },
      });
      if (!employee) throw new NotFoundException('Employé non trouvé');
      advance.employee = employee;
      advance.employee_id = dto.employee_id;
    }
    if (dto.amount != null) {
      if (Number(dto.amount) <= 0) {
        throw new BadRequestException(
          "Le montant de l'avance doit être strictement positif.",
        );
      }
      const salary =
        advance.employee?.salary != null
          ? Number(advance.employee.salary)
          : null;
      if (salary != null && salary > 0 && Number(dto.amount) > salary) {
        throw new BadRequestException(
          "L'avance ne peut pas dépasser le salaire de l'employé.",
        );
      }
      advance.amount = dto.amount;
    }
    if (dto.reason !== undefined) advance.reason = dto.reason;
    if (dto.date_granted) advance.date_granted = new Date(dto.date_granted);

    // Le statut peut être déplacé via update (raccourci UI) en réutilisant les transitions.
    if (dto.status && dto.status !== advance.status) {
      await this.repository.save(advance);
      if (dto.status === SalaryAdvanceStatus.APPROVED) return this.approve(id, actorId);
      if (dto.status === SalaryAdvanceStatus.PAID) return this.pay(id, actorId);
      if (dto.status === SalaryAdvanceStatus.CANCELLED) return this.cancel(id, undefined, actorId);
    }

    await this.repository.save(advance);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const advance = await this.findOne(id);
    if (
      advance.status === SalaryAdvanceStatus.PAID ||
      advance.status === SalaryAdvanceStatus.RECOVERED
    ) {
      throw new ForbiddenException(
        'Une avance versée ne peut pas être supprimée (impact comptable).',
      );
    }
    await this.repository.softDelete(id);
  }
}
