import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Payslip } from './entities/payslip.entity';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

@Injectable()
export class PayslipsService extends BaseServiceV1<Payslip> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Payslip)
    protected repository: Repository<Payslip>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollPeriod)
    private periodRepo: Repository<PayrollPeriod>,
    private readonly planQuotaService: PlanQuotaService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [],
      relationFields: ['employee', 'employee.user', 'period'],
    };
  }

  async create(dto: CreatePayslipDto): Promise<Payslip> {
    // ── Le module Paie doit être inclus dans le plan + quota mensuel ─────────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      await this.planQuotaService.checkModuleEnabled(tenantId, 'payroll');
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const currentCount = await this.repository
        .createQueryBuilder('p')
        .where('p.created_at >= :start', { start: monthStart })
        .getCount();
      await this.planQuotaService.checkLimit(tenantId, 'payslips', currentCount);
    }

    const entity = this.repository.create(dto);
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    entity.employee = employee;
    const period = await this.periodRepo.findOne({ where: { id: dto.period_id } });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    entity.period = period;
    return this.repository.save(entity);
  }

  findAll(): Promise<Payslip[]> {
    return this.repository.find({
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Payslip> {
    const payslip = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'employee.user', 'period', 'lines', 'lines.dossier'],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    return payslip;
  }

  async findByPeriod(period_id: number): Promise<Payslip[]> {
    return this.repository.find({
      where: { period_id },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async findByEmployee(employee_id: number): Promise<Payslip[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async update(id: number, dto: CreatePayslipDto): Promise<Payslip> {
    const payslip = await this.findOne(id);

    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
      if (!employee) throw new NotFoundException('Employé non trouvé');
      payslip.employee = employee;
    }

    if (dto.period_id) {
      const period = await this.periodRepo.findOne({ where: { id: dto.period_id } });
      if (!period) throw new NotFoundException('Période de paie non trouvée');
      payslip.period = period;
    }

    return this.repository.save({ ...payslip, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}