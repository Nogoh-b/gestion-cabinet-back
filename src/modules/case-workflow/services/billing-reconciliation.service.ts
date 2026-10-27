import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { ExpenseLine } from 'src/modules/supplier/entities/expense-line.entity';
import { ExpenseReportStatus } from 'src/modules/supplier/entities/expense-report.entity';
import { CaseBillingService } from './case-billing.service';
import { BillableItem } from '../entities/billing.entity';
import { WorkflowEngine } from '../case-workflow.enums';

export interface UnsyncedExpenseLine {
  expense_line_id: number;
  expense_report_id: number;
  dossier_id: number;
  description: string | null;
  amount_ht: number;
  amount_ttc: number;
  action_id: string | null;
}

export interface ReconciliationReport {
  tenant_id: number;
  dossier_id: number | null;
  dry_run: boolean;
  examined: number;
  missing: UnsyncedExpenseLine[];
  synced: Array<{
    expense_line_id: number;
    billable_item_id: string | null;
    status: string | null;
  }>;
  failed: Array<{ expense_line_id: number; error: string }>;
}

/**
 * Rapprochement des dépenses approuvées non synchronisées vers la
 * facturation (dossiers ACTIONS_V2 uniquement).
 *
 * - dry_run (défaut) : liste les lignes approuvées et refacturables sans
 *   élément facturable, sans rien créer.
 * - apply : rejoue la synchronisation via le chemin métier standard
 *   (syncExpenseLineById, idempotent : clé EXPENSE:<id>:APPROVED).
 */
@Injectable()
export class BillingReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly billingService: CaseBillingService,
  ) {}

  async findUnsyncedExpenseLines(filters: {
    tenantId: number;
    dossierId?: number;
    limit: number;
  }): Promise<UnsyncedExpenseLine[]> {
    const query = this.dataSource
      .getRepository(ExpenseLine)
      .createQueryBuilder('line')
      .innerJoin('line.expense_report', 'report')
      .innerJoin(
        Dossier,
        'dossier',
        'dossier.id = line.dossier_id AND dossier.tenant_id = line.tenant_id',
      )
      .leftJoin(
        BillableItem,
        'item',
        `item.source_event_key = CONCAT('EXPENSE:', line.id, ':APPROVED') AND item.tenant_id = line.tenant_id`,
      )
      .where('line.tenant_id = :tenantId', { tenantId: filters.tenantId })
      .andWhere('report.status IN (:...statuses)', {
        statuses: [
          ExpenseReportStatus.APPROVED,
          ExpenseReportStatus.REIMBURSED,
        ],
      })
      .andWhere('line.is_rebillable = :rebillable', { rebillable: true })
      .andWhere('line.dossier_id IS NOT NULL')
      .andWhere('dossier.workflow_engine = :engine', {
        engine: WorkflowEngine.ACTIONS_V2,
      })
      .andWhere('item.id IS NULL')
      .orderBy('line.id', 'ASC')
      .limit(Math.max(1, Math.min(filters.limit, 1000)));
    if (filters.dossierId) {
      query.andWhere('line.dossier_id = :dossierId', {
        dossierId: filters.dossierId,
      });
    }
    const lines = await query.getMany();
    return lines.map((line) => ({
      expense_line_id: line.id,
      expense_report_id: line.expense_report_id,
      dossier_id: line.dossier_id as number,
      description: line.description ?? null,
      amount_ht: Number(line.amount_ht ?? 0),
      amount_ttc: Number(line.amount_ttc ?? 0),
      action_id: line.action_id ?? null,
    }));
  }

  async reconcile(options: {
    tenantId: number;
    dossierId?: number;
    limit: number;
    apply: boolean;
    actorUserId: number | null;
  }): Promise<ReconciliationReport> {
    return new TenantContext().run(options.tenantId, async () => {
      const missing = await this.findUnsyncedExpenseLines({
        tenantId: options.tenantId,
        dossierId: options.dossierId,
        limit: options.limit,
      });
      const report: ReconciliationReport = {
        tenant_id: options.tenantId,
        dossier_id: options.dossierId ?? null,
        dry_run: !options.apply,
        examined: missing.length,
        missing,
        synced: [],
        failed: [],
      };
      if (!options.apply) return report;
      for (const line of missing) {
        try {
          const item = await this.billingService.syncExpenseLineById(
            line.expense_line_id,
            options.actorUserId,
          );
          report.synced.push({
            expense_line_id: line.expense_line_id,
            billable_item_id: item?.id ?? null,
            status: item?.status ?? null,
          });
        } catch (error) {
          report.failed.push({
            expense_line_id: line.expense_line_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return report;
    });
  }
}
