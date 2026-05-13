import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PayslipLine } from './entities/payslip-line.entity';
import { CreatePayslipLineDto } from './dto/create-payslip-line.dto';
import { Payslip } from './entities/payslip.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';

@Injectable()
export class PayslipLinesService {
  constructor(
    @InjectRepository(PayslipLine)
    private repository: Repository<PayslipLine>,
    @InjectRepository(Payslip)
    private payslipRepo: Repository<Payslip>,
    @InjectRepository(Dossier)
    private dossierRepo: Repository<Dossier>,
  ) {}

  async create(dto: CreatePayslipLineDto): Promise<PayslipLine> {
    const entity = this.repository.create(dto);
    const payslip = await this.payslipRepo.findOne({ where: { id: dto.payslip_id } });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    entity.payslip = payslip;
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (!dossier) throw new NotFoundException('Dossier non trouvé');
      entity.dossier = dossier;
    }
    return this.repository.save(entity);
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

  async update(id: number, dto: CreatePayslipLineDto): Promise<PayslipLine> {
    const line = await this.findOne(id);
    if (dto.payslip_id) {
      const payslip = await this.payslipRepo.findOne({ where: { id: dto.payslip_id } });
      if (payslip) {
        line.payslip = payslip;
      }
    }
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (dossier) {
        line.dossier = dossier;
      }
    }
    return this.repository.save({ ...line, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}