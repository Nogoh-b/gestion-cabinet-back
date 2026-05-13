import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { Branch } from '../agencies/branch/entities/branch.entity';

@Injectable()
export class PayrollPeriodsService extends BaseServiceV1<PayrollPeriod> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(PayrollPeriod)
    protected repository: Repository<PayrollPeriod>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePayrollPeriodDto): Promise<PayrollPeriod> {
    const entity = this.repository.create(dto);
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (branch) {
        entity.branch = branch;
      }
    }
    return this.repository.save(entity);
  }

  findAll(): Promise<PayrollPeriod[]> {
    return this.repository.find({
      relations: ['branch', 'payslips'],
      order: { start_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PayrollPeriod> {
    const period = await this.repository.findOne({
      where: { id },
      relations: ['branch', 'payslips', 'payslips.employee', 'payslips.lines'],
    });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    return period;
  }

  async update(id: number, dto: CreatePayrollPeriodDto): Promise<PayrollPeriod> {
    const period = await this.findOne(id);
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (branch) {
        period.branch = branch;
      }
    }
    return this.repository.save({ ...period, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}