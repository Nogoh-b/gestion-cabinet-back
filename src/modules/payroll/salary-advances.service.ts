import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { PaySalaryAdvanceDto } from './dto/pay-salary-advance.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import {
  SalaryAdvance,
  SalaryAdvanceStatus,
} from './entities/salary-advance.entity';
import type { PayrollActor } from './payslips.service';

@Injectable()
export class SalaryAdvancesService extends BaseServiceV1<SalaryAdvance> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(SalaryAdvance)
    protected repository: Repository<SalaryAdvance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reason', 'payment_reference'],
      exactMatchFields: ['id', 'employee_id', 'status'],
      relationFields: ['employee', 'employee.user'],
    };
  }

  async create(
    dto: CreateSalaryAdvanceDto,
    actor: PayrollActor,
  ): Promise<SalaryAdvance> {
    const tenantId = getCurrentTenantId();
    const user = await this.resolveActor(this.userRepo.manager, actor);
    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employee_id, tenant_id: tenantId },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const amount = this.fromMinorUnits(this.toMinorUnits(dto.amount));
    this.assertWithinSalary(amount, employee);
    const dateGranted = dto.date_granted
      ? new Date(dto.date_granted)
      : new Date();
    if (
      Number.isNaN(dateGranted.getTime()) ||
      dateGranted.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('Date d’octroi invalide');
    }
    const saved = await this.repository.save(
      this.repository.create({
        employee_id: employee.id,
        employee,
        amount,
        reason: dto.reason?.trim() || null,
        date_granted: dateGranted,
        status: SalaryAdvanceStatus.PENDING,
        recovered_amount: 0,
        requested_by_id: user.id,
        requested_by: user,
        approved_by_id: null,
        approved_at: null,
        paid_by_id: null,
        payment_date: null,
        payment_method: null,
        payment_reference: null,
        cancelled_by_id: null,
        cancelled_at: null,
        cancellation_reason: null,
        tenant_id: tenantId,
      }),
    );
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId: user.id,
        action: 'salary_advance.requested',
        resourceType: 'salary_advance',
        resourceId: saved.id,
        afterState: {
          status: saved.status,
          employeeId: saved.employee_id,
          amount: Number(saved.amount),
        },
      }),
    );
    return this.findOne(saved.id);
  }

  findAll(): Promise<SalaryAdvance[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SalaryAdvance> {
    const advance = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        'employee',
        'employee.user',
        'requested_by',
        'approved_by',
        'paid_by',
        'cancelled_by',
      ],
    });
    if (!advance) {
      throw new NotFoundException('Avance sur salaire non trouvée');
    }
    return advance;
  }

  async findOwn(actor: PayrollActor): Promise<SalaryAdvance[]> {
    const user = await this.resolveActor(this.userRepo.manager, actor);
    if (!user.employee?.id) {
      throw new ForbiddenException(
        'Aucun collaborateur n’est rattaché à cet utilisateur',
      );
    }
    const advances = await this.repository.find({
      where: {
        employee_id: user.employee.id,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
    await this.auditSensitiveRead(
      user.id,
      'salary_advance.own_list_viewed',
      user.employee.id,
      { count: advances.length },
    );
    return advances;
  }

  async findOwnOne(
    id: number,
    actor: PayrollActor,
  ): Promise<SalaryAdvance> {
    const user = await this.resolveActor(this.userRepo.manager, actor);
    if (!user.employee?.id) {
      throw new ForbiddenException(
        'Aucun collaborateur n’est rattaché à cet utilisateur',
      );
    }
    const advance = await this.repository.findOne({
      where: {
        id,
        employee_id: user.employee.id,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user'],
    });
    if (!advance) {
      throw new NotFoundException('Avance personnelle non trouvée');
    }
    await this.auditSensitiveRead(
      user.id,
      'salary_advance.own_viewed',
      advance.id,
      { employeeId: user.employee.id },
    );
    return advance;
  }

  findByEmployee(employeeId: number): Promise<SalaryAdvance[]> {
    return this.repository.find({
      where: {
        employee_id: employeeId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user'],
      order: { created_at: 'DESC' },
    });
  }

  async approve(
    id: number,
    actor: PayrollActor,
  ): Promise<SalaryAdvance> {
    return this.dataSource.transaction(async (manager) => {
      const advance = await this.lockAdvance(manager, id);
      if (advance.status !== SalaryAdvanceStatus.PENDING) {
        throw new BadRequestException(
          'Seule une avance demandée peut être approuvée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (advance.requested_by_id === user.id) {
        throw new ForbiddenException(
          'Le demandeur ne peut pas approuver sa propre avance',
        );
      }
      advance.status = SalaryAdvanceStatus.APPROVED;
      advance.approved_by_id = user.id;
      advance.approved_by = user;
      advance.approved_at = new Date();
      const saved = await manager
        .getRepository(SalaryAdvance)
        .save(advance);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'salary_advance.approved',
        resourceType: 'salary_advance',
        resourceId: saved.id,
        beforeState: { status: SalaryAdvanceStatus.PENDING },
        afterState: {
          status: saved.status,
          approvedAt: saved.approved_at,
        },
      });
      return saved;
    });
  }

  async pay(
    id: number,
    dto: PaySalaryAdvanceDto,
    actor: PayrollActor,
  ): Promise<SalaryAdvance> {
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    if (
      Number.isNaN(paymentDate.getTime()) ||
      paymentDate.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('Date de versement invalide');
    }
    return this.dataSource.transaction(async (manager) => {
      const advance = await this.lockAdvance(manager, id);
      if (advance.status !== SalaryAdvanceStatus.APPROVED) {
        throw new BadRequestException(
          'L’avance doit être approuvée avant versement',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (advance.approved_by_id === user.id) {
        throw new ForbiddenException(
          'Le payeur doit être distinct de l’approbateur',
        );
      }
      advance.status = SalaryAdvanceStatus.PAID;
      advance.payment_date = paymentDate;
      advance.payment_method = dto.paymentMethod;
      advance.payment_reference = dto.paymentReference.trim();
      advance.paid_by_id = user.id;
      advance.paid_by = user;
      const saved = await manager
        .getRepository(SalaryAdvance)
        .save(advance);
      const audit = await this.auditService.append(manager, {
        actorId: user.id,
        action: 'salary_advance.paid',
        resourceType: 'salary_advance',
        resourceId: saved.id,
        beforeState: { status: SalaryAdvanceStatus.APPROVED },
        afterState: {
          status: saved.status,
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'salary_advance.paid',
        aggregateType: 'salary_advance',
        aggregateId: saved.id,
        idempotencyKey: `salary-advance-paid:${audit.id}`,
        payload: {
          salaryAdvanceId: saved.id,
          employeeId: saved.employee_id,
          employeeName: saved.employee?.full_name ?? null,
          amount: Number(saved.amount),
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
        },
      });
      return saved;
    });
  }

  async cancel(
    id: number,
    reason: string,
    actor: PayrollActor,
  ): Promise<SalaryAdvance> {
    return this.dataSource.transaction(async (manager) => {
      const advance = await this.lockAdvance(manager, id);
      if (
        ![
          SalaryAdvanceStatus.PENDING,
          SalaryAdvanceStatus.APPROVED,
        ].includes(advance.status)
      ) {
        throw new ForbiddenException(
          'Une avance versée ou récupérée ne peut pas être annulée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      const previousStatus = advance.status;
      advance.status = SalaryAdvanceStatus.CANCELLED;
      advance.cancelled_by_id = user.id;
      advance.cancelled_by = user;
      advance.cancelled_at = new Date();
      advance.cancellation_reason = reason.trim();
      const saved = await manager
        .getRepository(SalaryAdvance)
        .save(advance);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'salary_advance.cancelled',
        resourceType: 'salary_advance',
        resourceId: saved.id,
        beforeState: { status: previousStatus },
        afterState: {
          status: saved.status,
          cancelledAt: saved.cancelled_at,
        },
        justification: saved.cancellation_reason,
      });
      return saved;
    });
  }

  async update(
    id: number,
    dto: UpdateSalaryAdvanceDto,
  ): Promise<SalaryAdvance> {
    const advance = await this.findOne(id);
    if (advance.status !== SalaryAdvanceStatus.PENDING) {
      throw new ForbiddenException(
        'Seule une avance demandée est modifiable',
      );
    }
    if (dto.amount !== undefined) {
      const amount = this.fromMinorUnits(
        this.toMinorUnits(dto.amount),
      );
      this.assertWithinSalary(amount, advance.employee);
      advance.amount = amount;
    }
    if (dto.reason !== undefined) {
      advance.reason = dto.reason.trim();
    }
    if (dto.date_granted) {
      const date = new Date(dto.date_granted);
      if (
        Number.isNaN(date.getTime()) ||
        date.getTime() > Date.now() + 60_000
      ) {
        throw new BadRequestException('Date d’octroi invalide');
      }
      advance.date_granted = date;
    }
    return this.repository.save(advance);
  }

  async remove(id: number, actor: PayrollActor): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const advance = await this.lockAdvance(manager, id);
      if (advance.status !== SalaryAdvanceStatus.PENDING) {
        throw new ForbiddenException(
          'Seule une demande non approuvée peut être supprimée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      await manager.getRepository(SalaryAdvance).softDelete(id);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'salary_advance.request_deleted',
        resourceType: 'salary_advance',
        resourceId: advance.id,
        beforeState: {
          status: advance.status,
          employeeId: advance.employee_id,
          amount: Number(advance.amount),
        },
      });
    });
  }

  private async lockAdvance(
    manager: EntityManager,
    id: number,
  ): Promise<SalaryAdvance> {
    const repository = manager.getRepository(SalaryAdvance);
    const locked = await repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) {
      throw new NotFoundException('Avance sur salaire non trouvée');
    }
    const advance = await repository.findOne({
      where: { id: locked.id, tenant_id: getCurrentTenantId() },
      relations: ['employee'],
    });
    if (!advance) {
      throw new NotFoundException('Avance sur salaire non trouvée');
    }
    return advance;
  }

  private async resolveActor(
    manager: EntityManager,
    actor: PayrollActor,
  ): Promise<User> {
    const actorId = Number(actor?.userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    const user = await manager.getRepository(User).findOne({
      where: { id: actorId, tenant_id: getCurrentTenantId() },
      relations: ['employee'],
    });
    if (!user) throw new ForbiddenException('Utilisateur introuvable');
    return user;
  }

  private async auditSensitiveRead(
    actorId: number,
    action: string,
    resourceId: number,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId,
        action,
        resourceType: 'salary_advance',
        resourceId,
        afterState,
      }),
    );
  }

  private assertWithinSalary(
    amount: number,
    employee: Employee,
  ): void {
    const salary = Number(employee.salary ?? 0);
    if (salary > 0 && amount > salary) {
      throw new BadRequestException(
        'L’avance ne peut pas dépasser le salaire mensuel',
      );
    }
  }

  private toMinorUnits(value: number | string): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      numeric <= 0 ||
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Le montant doit être positif avec au plus deux décimales',
      );
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }
}
