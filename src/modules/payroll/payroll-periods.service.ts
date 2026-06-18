import { Repository } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { PayrollPeriod, PayrollPeriodStatus } from './entities/payroll-period.entity';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import { Branch } from '../agencies/branch/entities/branch.entity';
import { PayslipsService } from './payslips.service';
import { PayslipStatus } from './entities/payslip.entity';

export interface ClosePeriodResult {
  period_id: number;
  validated: number;
  already_validated: number;
  errors: { payslip_id: number; reason: string }[];
}

@Injectable()
export class PayrollPeriodsService extends BaseServiceV1<PayrollPeriod> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(PayrollPeriod)
    protected repository: Repository<PayrollPeriod>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
    private readonly payslipsService: PayslipsService,
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

  async update(id: number, dto: UpdatePayrollPeriodDto): Promise<PayrollPeriod> {
    const period = await this.findOne(id);
    if (period.status === PayrollPeriodStatus.PAID) {
      throw new BadRequestException('Une période payée ne peut plus être modifiée.');
    }
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (branch) {
        period.branch = branch;
      }
    }
    return this.repository.save({ ...period, ...dto });
  }

  /**
   * Clôture (valide) une période : valide tous les bulletins encore en brouillon,
   * puis passe la période en « validée ». Les bulletins déjà validés/payés sont conservés.
   */
  async close(id: number): Promise<ClosePeriodResult> {
    const period = await this.findOne(id);
    if (period.status === PayrollPeriodStatus.PAID) {
      throw new BadRequestException('Période déjà payée.');
    }

    const result: ClosePeriodResult = {
      period_id: id,
      validated: 0,
      already_validated: 0,
      errors: [],
    };

    for (const payslip of period.payslips ?? []) {
      if (payslip.status === PayslipStatus.DRAFT) {
        try {
          await this.payslipsService.validate(payslip.id);
          result.validated++;
        } catch (e) {
          result.errors.push({ payslip_id: payslip.id, reason: (e as Error).message });
        }
      } else {
        result.already_validated++;
      }
    }

    period.status = PayrollPeriodStatus.VALIDATED;
    await this.repository.save(period);
    return result;
  }

  async remove(id: number): Promise<void> {
    const period = await this.findOne(id);
    if (period.status === PayrollPeriodStatus.PAID) {
      throw new BadRequestException('Une période payée ne peut pas être supprimée.');
    }
    await this.repository.softDelete(id);
  }
}
