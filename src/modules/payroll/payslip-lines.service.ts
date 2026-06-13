import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PayslipLine } from './entities/payslip-line.entity';
import { CreatePayslipLineDto } from './dto/create-payslip-line.dto';
import { UpdatePayslipLineDto } from './dto/update-payslip-line.dto';
import { Payslip, PayslipStatus } from './entities/payslip.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { PayslipsService } from './payslips.service';

@Injectable()
export class PayslipLinesService {
  constructor(
    @InjectRepository(PayslipLine)
    private repository: Repository<PayslipLine>,
    @InjectRepository(Payslip)
    private payslipRepo: Repository<Payslip>,
    @InjectRepository(Dossier)
    private dossierRepo: Repository<Dossier>,
    private readonly payslipsService: PayslipsService,
  ) {}

  /** Interdit de toucher aux lignes d'un bulletin validé ou payé. */
  private assertParentMutable(payslip: Payslip): void {
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new ForbiddenException(
        'Les lignes ne sont modifiables que sur un bulletin au statut brouillon.',
      );
    }
  }

  async create(dto: CreatePayslipLineDto): Promise<PayslipLine> {
    const entity = this.repository.create(dto);
    const payslip = await this.payslipRepo.findOne({ where: { id: dto.payslip_id } });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    this.assertParentMutable(payslip);
    entity.payslip = payslip;
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (!dossier) throw new NotFoundException('Dossier non trouvé');
      entity.dossier = dossier;
    }
    const saved = await this.repository.save(entity);
    await this.payslipsService.recomputeTotals(dto.payslip_id);
    return saved;
  }

  async findByPayslip(payslip_id: number): Promise<PayslipLine[]> {
    return this.repository.find({
      where: { payslip_id },
      relations: ['dossier'],
      order: { line_type: 'ASC' },
    });
  }

  async findOne(id: number): Promise<PayslipLine> {
    const line = await this.repository.findOne({
      where: { id },
      relations: ['payslip', 'dossier'],
    });
    if (!line) throw new NotFoundException('Ligne de paie non trouvée');
    return line;
  }

  async update(id: number, dto: UpdatePayslipLineDto): Promise<PayslipLine> {
    const line = await this.findOne(id);
    if (line.payslip) this.assertParentMutable(line.payslip);

    if (dto.payslip_id) {
      const payslip = await this.payslipRepo.findOne({ where: { id: dto.payslip_id } });
      if (payslip) {
        this.assertParentMutable(payslip);
        line.payslip = payslip;
      }
    }
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (dossier) {
        line.dossier = dossier;
      }
    }
    const saved = await this.repository.save({ ...line, ...dto });
    await this.payslipsService.recomputeTotals(line.payslip_id);
    return saved;
  }

  async remove(id: number): Promise<void> {
    const line = await this.findOne(id);
    if (line.payslip) this.assertParentMutable(line.payslip);
    const payslipId = line.payslip_id;
    await this.repository.delete(id);
    await this.payslipsService.recomputeTotals(payslipId);
  }
}
