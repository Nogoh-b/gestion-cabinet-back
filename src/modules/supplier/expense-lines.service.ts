import { DataSource, Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ExpenseLine } from './entities/expense-line.entity';
import { CreateExpenseLineDto } from './dto/create-expense-line.dto';
import { UpdateExpenseLineDto } from './dto/update-expense-line.dto';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { BillableItemStatus } from '../case-workflow/case-workflow.enums';

@Injectable()
export class ExpenseLinesService {
  constructor(
    @InjectRepository(ExpenseLine)
    private repository: Repository<ExpenseLine>,
    private readonly dataSource: DataSource,
    private readonly caseBillingService: CaseBillingService,
  ) {}

  async create(
    dto: CreateExpenseLineDto,
    actorUserId: number | null = null,
  ): Promise<ExpenseLine> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const expenseReport = await manager
        .getRepository(ExpenseReport)
        .findOne({
          where: { id: dto.expense_report_id, tenant_id: tenantId },
        });
      if (!expenseReport)
        throw new NotFoundException('Note de frais non trouvée');
      this.assertRebillableHasDossier(dto.is_rebillable, dto.dossier_id);
      const dossier = await this.resolveDossier(
        manager,
        dto.dossier_id,
        tenantId,
      );
      await this.assertActionBelongsToDossier(
        manager,
        dto.action_id,
        dto.dossier_id,
        tenantId,
      );
      const repository = manager.getRepository(ExpenseLine);
      const entity = repository.create(dto);
      entity.expense_report = expenseReport;
      if (dossier) entity.dossier = dossier;
      const saved = await repository.save(entity);
      saved.expense_report = expenseReport;
      if (this.reportAllowsBilling(expenseReport.status)) {
        await this.caseBillingService.syncExpenseLineToBillableItem(
          manager,
          saved,
          actorUserId,
          true,
        );
      }
      return saved;
    });
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

  async update(
    id: number,
    dto: UpdateExpenseLineDto,
    actorUserId: number | null = null,
  ): Promise<ExpenseLine> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ExpenseLine);
      const line = await repository.findOne({
        where: { id, tenant_id: tenantId },
        relations: ['expense_report', 'dossier'],
      });
      if (!line)
        throw new NotFoundException('Ligne de dépense non trouvée');
      let expenseReport = line.expense_report;
      if (dto.expense_report_id) {
        const nextExpenseReport = await manager
          .getRepository(ExpenseReport)
          .findOne({
            where: { id: dto.expense_report_id, tenant_id: tenantId },
          });
        if (!nextExpenseReport)
          throw new NotFoundException('Note de frais non trouvée');
        expenseReport = nextExpenseReport;
      }
      const dossierId = dto.dossier_id ?? line.dossier_id;
      const isRebillable = dto.is_rebillable ?? line.is_rebillable;
      const actionId = dto.action_id ?? line.action_id;
      this.assertRebillableHasDossier(isRebillable, dossierId);
      const dossier = await this.resolveDossier(manager, dossierId, tenantId);
      await this.assertActionBelongsToDossier(
        manager,
        actionId,
        dossierId,
        tenantId,
      );
      Object.assign(line, dto);
      line.expense_report = expenseReport;
      if (dossier) line.dossier = dossier;
      const saved = await repository.save(line);
      saved.expense_report = expenseReport;
      await this.caseBillingService.syncExpenseLineToBillableItem(
        manager,
        saved,
        actorUserId,
        this.reportAllowsBilling(expenseReport.status),
      );
      return saved;
    });
  }

  async remove(id: number, actorUserId: number | null = null): Promise<void> {
    const tenantId = getCurrentTenantId();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ExpenseLine);
      const line = await repository.findOne({
        where: { id, tenant_id: tenantId },
        relations: ['expense_report'],
      });
      if (!line)
        throw new NotFoundException('Ligne de dépense non trouvée');
      const item = await this.caseBillingService.syncExpenseLineToBillableItem(
        manager,
        line,
        actorUserId,
        false,
      );
      if (
        item &&
        [
          BillableItemStatus.RESERVED,
          BillableItemStatus.INVOICED,
          BillableItemStatus.ADJUSTED,
        ].includes(item.status)
      ) {
        throw new ConflictException(
          'Cette dépense est déjà engagée dans la facturation et ne peut plus être supprimée',
        );
      }
      await repository.delete({ id, tenant_id: tenantId });
    });
  }

  private assertRebillableHasDossier(
    isRebillable: boolean | undefined,
    dossierId: number | undefined,
  ): void {
    if (isRebillable && !dossierId) {
      throw new BadRequestException(
        'Un dossier est obligatoire pour refacturer une dépense',
      );
    }
  }

  private async resolveDossier(
    manager: import('typeorm').EntityManager,
    dossierId: number | undefined,
    tenantId: number,
  ): Promise<Dossier | null> {
    if (!dossierId) return null;
    const dossier = await manager.getRepository(Dossier).findOne({
      where: { id: dossierId, tenant_id: tenantId },
    });
    if (!dossier) throw new NotFoundException('Dossier non trouvé');
    return dossier;
  }

  private async assertActionBelongsToDossier(
    manager: import('typeorm').EntityManager,
    actionId: string | undefined | null,
    dossierId: number | undefined,
    tenantId: number,
  ): Promise<void> {
    if (!actionId) return;
    if (!dossierId) {
      throw new BadRequestException(
        'Un dossier est obligatoire pour associer une action',
      );
    }
    const action = await manager.getRepository(DossierAction).findOne({
      where: { id: actionId, dossier_id: dossierId, tenant_id: tenantId },
    });
    if (!action) {
      throw new BadRequestException(
        'L’action associée n’appartient pas au dossier sélectionné',
      );
    }
  }

  private reportAllowsBilling(status: ExpenseReportStatus): boolean {
    return [
      ExpenseReportStatus.APPROVED,
      ExpenseReportStatus.REIMBURSED,
    ].includes(status);
  }
}
