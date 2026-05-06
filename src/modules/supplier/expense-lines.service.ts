import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ExpenseLine } from './entities/expense-line.entity';
import { CreateExpenseLineDto } from './dto/create-expense-line.dto';
import { UpdateExpenseLineDto } from './dto/update-expense-line.dto';
import { ExpenseReport } from './entities/expense-report.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';

@Injectable()
export class ExpenseLinesService {
  constructor(
    @InjectRepository(ExpenseLine)
    private repository: Repository<ExpenseLine>,
    @InjectRepository(ExpenseReport)
    private reportRepo: Repository<ExpenseReport>,
    @InjectRepository(Dossier)
    private dossierRepo: Repository<Dossier>,
  ) {}

  async create(dto: CreateExpenseLineDto): Promise<ExpenseLine> {
    const entity = this.repository.create(dto);
    const expenseReport = await this.reportRepo.findOne({
      where: { id: dto.expense_report_id },
    });
    if (!expenseReport)
      throw new NotFoundException('Note de frais non trouvée');
    entity.expense_report = expenseReport;
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (!dossier) throw new NotFoundException('Dossier non trouvé');
      entity.dossier = dossier;
    }
    return this.repository.save(entity);
  }

  async findByReport(report_id: number): Promise<ExpenseLine[]> {
    return this.repository.find({
      where: { expense_report_id: report_id },
      relations: ['dossier'],
      order: { expense_date: 'ASC' },
    });
  }

  async findOne(id: number): Promise<ExpenseLine> {
    const line = await this.repository.findOne({
      where: { id },
      relations: ['expense_report', 'dossier'],
    });
    if (!line) throw new NotFoundException('Ligne de dépense non trouvée');
    return line;
  }

  async update(id: number, dto: UpdateExpenseLineDto): Promise<ExpenseLine> {
    const line = await this.findOne(id);
    if (dto.expense_report_id) {
      const expenseReport = await this.reportRepo.findOne({
        where: { id: dto.expense_report_id },
      });
      if (!expenseReport)
        throw new NotFoundException('Note de frais non trouvée');
      line.expense_report = expenseReport;
    }
    if (dto.dossier_id) {
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
      if (!dossier) throw new NotFoundException('Dossier non trouvé');
      line.dossier = dossier;
    }
    return this.repository.save({ ...line, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}