import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PayrollContribution,
  ContributionBase,
  ContributionPayer,
} from './entities/payroll-contribution.entity';
import { CreatePayrollContributionDto } from './dto/create-payroll-contribution.dto';
import { UpdatePayrollContributionDto } from './dto/update-payroll-contribution.dto';

/**
 * Barème par défaut indicatif (contexte CEMAC / Cameroun).
 * ⚠️ Valeurs à VALIDER par le cabinet avant exploitation réelle.
 */
const DEFAULT_CONTRIBUTIONS: Partial<PayrollContribution>[] = [
  { code: 'CNPS_PVID_SAL', label: 'CNPS - Pension vieillesse (part salariale)', rate: 4.2, base_type: ContributionBase.GROSS, payer: ContributionPayer.EMPLOYEE, ceiling: 750000, account_number: '431', sort_order: 10 },
  { code: 'CNPS_PVID_PAT', label: 'CNPS - Pension vieillesse (part patronale)', rate: 4.2, base_type: ContributionBase.GROSS, payer: ContributionPayer.EMPLOYER, ceiling: 750000, account_number: '431', sort_order: 20 },
  { code: 'CNPS_PF', label: 'CNPS - Prestations familiales (patronale)', rate: 7.0, base_type: ContributionBase.GROSS, payer: ContributionPayer.EMPLOYER, ceiling: 750000, account_number: '431', sort_order: 30 },
  { code: 'CNPS_AT', label: 'CNPS - Accidents du travail (patronale)', rate: 1.75, base_type: ContributionBase.GROSS, payer: ContributionPayer.EMPLOYER, account_number: '431', sort_order: 40 },
  { code: 'CFC_SAL', label: 'Crédit Foncier (part salariale)', rate: 1.0, base_type: ContributionBase.TAXABLE, payer: ContributionPayer.EMPLOYEE, account_number: '447', sort_order: 50 },
  { code: 'RAV', label: 'Redevance audiovisuelle', rate: 0, base_type: ContributionBase.FIXED, payer: ContributionPayer.EMPLOYEE, account_number: '447', sort_order: 60 },
];

@Injectable()
export class PayrollContributionsService {
  constructor(
    @InjectRepository(PayrollContribution)
    private readonly repository: Repository<PayrollContribution>,
  ) {}

  create(dto: CreatePayrollContributionDto): Promise<PayrollContribution> {
    return this.repository.save(this.repository.create(dto));
  }

  findAll(): Promise<PayrollContribution[]> {
    return this.repository.find({ order: { sort_order: 'ASC', id: 'ASC' } });
  }

  findActive(): Promise<PayrollContribution[]> {
    return this.repository.find({ where: { is_active: true }, order: { sort_order: 'ASC' } });
  }

  async findOne(id: number): Promise<PayrollContribution> {
    const item = await this.repository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Cotisation non trouvée');
    return item;
  }

  async update(id: number, dto: UpdatePayrollContributionDto): Promise<PayrollContribution> {
    const item = await this.findOne(id);
    return this.repository.save({ ...item, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Installe le barème par défaut pour le cabinet courant si aucune cotisation
   * n'existe encore. Idempotent.
   */
  async seedDefaults(): Promise<{ created: number }> {
    const existing = await this.repository.count();
    if (existing > 0) return { created: 0 };
    let created = 0;
    for (const c of DEFAULT_CONTRIBUTIONS) {
      await this.repository.save(this.repository.create({ ...c, is_active: true }));
      created++;
    }
    return { created };
  }
}
