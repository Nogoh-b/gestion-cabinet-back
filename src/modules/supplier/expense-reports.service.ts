import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { ExpenseReport } from './entities/expense-report.entity';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';

@Injectable()
export class ExpenseReportsService extends BaseServiceV1<ExpenseReport> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(ExpenseReport)
    protected repository: Repository<ExpenseReport>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly planQuotaService: PlanQuotaService,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateExpenseReportDto): Promise<ExpenseReport> {
    // ── Le module Dépenses doit être inclus dans le plan + quota mensuel ─────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      await this.planQuotaService.checkModuleEnabled(tenantId, 'expenses');
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      let qb = this.repository
        .createQueryBuilder('e')
        .where('e.created_at >= :start', { start: monthStart });
      qb = addTenantCondition(qb, 'e');
      const currentCount = await qb.getCount();
      await this.planQuotaService.checkLimit(tenantId, 'expenses', currentCount);
    }

    const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const entity = this.repository.create(dto);
    entity.employee = employee;
    return this.repository.save(entity);
  }

  findAll(): Promise<ExpenseReport[]> {
    return this.repository.find({
      relations: ['employee', 'approved_by'],
      order: { submission_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ExpenseReport> {
    const report = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'approved_by', 'lines', 'lines.dossier'],
    });
    if (!report) throw new NotFoundException('Note de frais non trouvée');
    return report;
  }

  async findByEmployee(employee_id: number): Promise<ExpenseReport[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee'],
      order: { submission_date: 'DESC' },
    });
  }

  async approve(id: number, userId: number): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    report.status = 'approved' as any;
    report.approved_by = user as any;
    return this.repository.save(report);
  }

  async reject(id: number, userId: number, notes: string): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    report.status = 'rejected' as any;
    report.approved_by = user as any;
    report.notes = notes;
    return this.repository.save(report);
  }

  async markReimbursed(id: number): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    report.status = 'reimbursed' as any;
    report.reimbursement_date = new Date();
    const saved = await this.repository.save(report);
    const full  = await this.findOne(saved.id);
    this.eventEmitter.emit('expense_report.remboursee', full);
    return saved;
  }

  async update(id: number, dto: UpdateExpenseReportDto): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
      if (!employee) throw new NotFoundException('Employé non trouvé');
      report.employee = employee;
    }
    return this.repository.save({ ...report, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}