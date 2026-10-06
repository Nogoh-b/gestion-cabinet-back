import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import {
  BillableItemStatus,
  BillableSourceType,
} from '../case-workflow/case-workflow.enums';
import { BillableItem } from '../case-workflow/entities/billing.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import {
  CreateUnifiedExpenseDto,
  ExpenseWorkspaceFinalization,
  ExpenseWorkspaceOrigin,
  ExpenseWorkspaceSearchDto,
  ExpenseWorkspaceTarget,
} from './dto/expense-workspace.dto';
import { ExpenseLine, ExpenseRebillingType } from './entities/expense-line.entity';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';
import { Supplier } from './entities/supplier.entity';
import {
  SupplierInvoice,
  SupplierInvoiceStatus,
} from './entities/supplier-invoice.entity';

type AuthenticatedUser = User & {
  userId?: number;
  permissions?: string[];
  tenantId?: number;
};

export interface ExpenseWorkspaceRow {
  row_id: string;
  source_type: ExpenseWorkspaceOrigin;
  source_id: number;
  parent_id: number | null;
  occurred_at: Date;
  kind: 'INTERNAL' | 'EXPENSE' | 'DISBURSEMENT';
  label: string;
  party_name: string;
  supplier_id: number | null;
  employee_id: number | null;
  dossier_id: number | null;
  dossier_number: string | null;
  action_id: string | null;
  amount_ht: number;
  tax_rate: number;
  amount_ttc: number;
  currency: string;
  workflow_status: string;
  billing_status: BillableItemStatus | null;
  is_rebillable: boolean;
  attachment_url: string | null;
  detail_href: string;
}

@Injectable()
export class ExpenseWorkspaceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly caseBillingService: CaseBillingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly planQuotaService: PlanQuotaService,
    @InjectRepository(SupplierInvoice)
    private readonly supplierInvoiceRepository: Repository<SupplierInvoice>,
    @InjectRepository(ExpenseReport)
    private readonly expenseReportRepository: Repository<ExpenseReport>,
    @InjectRepository(ExpenseLine)
    private readonly expenseLineRepository: Repository<ExpenseLine>,
  ) {}

  async search(filters: ExpenseWorkspaceSearchDto) {
    const rows = await this.filteredRows(filters);
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const start = (page - 1) * limit;
    const total = rows.length;
    return {
      data: rows.slice(start, start + limit),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
        has_previous: page > 1,
        has_next: start + limit < total,
      },
    };
  }

  async summary(filters: ExpenseWorkspaceSearchDto) {
    const rows = await this.filteredRows({ ...filters, page: 1, limit: 100 });
    const sum = (predicate: (row: ExpenseWorkspaceRow) => boolean) =>
      rows
        .filter(predicate)
        .reduce((total, row) => total + Number(row.amount_ttc || 0), 0);
    return {
      total: sum(() => true),
      pending_validation: sum((row) =>
        ['draft', 'submitted', 'received'].includes(row.workflow_status),
      ),
      to_settle: sum((row) => row.workflow_status === 'approved'),
      rebillable: sum((row) => row.is_rebillable),
      count: rows.length,
    };
  }

  async findByDossier(dossierId: number) {
    return this.search({ dossier_id: dossierId, page: 1, limit: 100 });
  }

  async create(dto: CreateUnifiedExpenseDto, user: AuthenticatedUser) {
    this.assertCreatePermission(dto, user);
    this.assertTarget(dto);
    if (dto.origin === ExpenseWorkspaceOrigin.SUPPLIER_INVOICE) {
      return this.createSupplierInvoice(dto, user);
    }
    return this.createExpenseReport(dto, user);
  }

  private async filteredRows(
    filters: ExpenseWorkspaceSearchDto,
  ): Promise<ExpenseWorkspaceRow[]> {
    const tenantId = getCurrentTenantId();
    const [invoices, lines, billableItems] = await Promise.all([
      this.supplierInvoiceRepository.find({
        where: { tenant_id: tenantId },
        relations: { supplier: true, dossier: true },
      }),
      this.expenseLineRepository.find({
        where: { tenant_id: tenantId },
        relations: {
          dossier: true,
          expense_report: { employee: { user: true } },
        },
      }),
      this.dataSource.getRepository(BillableItem).find({
        where: {
          tenant_id: tenantId,
          source_type: BillableSourceType.EXPENSE,
        },
      }),
    ]);
    const billingByKey = new Map(
      billableItems.map((item) => [item.source_event_key, item.status]),
    );
    const rows: ExpenseWorkspaceRow[] = [
      ...invoices.map((invoice) =>
        this.mapSupplierInvoice(invoice, billingByKey),
      ),
      ...lines.map((line) => this.mapExpenseLine(line, billingByKey)),
    ];
    const search = filters.search?.trim().toLocaleLowerCase('fr') || '';
    return rows
      .filter((row) => {
        if (filters.origin && row.source_type !== filters.origin) return false;
        if (
          filters.target === ExpenseWorkspaceTarget.INTERNAL &&
          row.is_rebillable
        )
          return false;
        if (
          filters.target === ExpenseWorkspaceTarget.DOSSIER &&
          !row.is_rebillable
        )
          return false;
        if (
          filters.rebilling_type &&
          row.kind !==
            (filters.rebilling_type === ExpenseRebillingType.DISBURSEMENT
              ? 'DISBURSEMENT'
              : 'EXPENSE')
        )
          return false;
        if (filters.status && row.workflow_status !== filters.status) return false;
        if (filters.supplier_id && row.supplier_id !== filters.supplier_id)
          return false;
        if (filters.employee_id && row.employee_id !== filters.employee_id)
          return false;
        if (filters.dossier_id && row.dossier_id !== filters.dossier_id)
          return false;
        if (
          filters.is_rebillable !== undefined &&
          row.is_rebillable !== filters.is_rebillable
        )
          return false;
        const date = new Date(row.occurred_at).getTime();
        if (filters.from && date < new Date(filters.from).getTime()) return false;
        if (filters.to) {
          const to = new Date(filters.to);
          to.setHours(23, 59, 59, 999);
          if (date > to.getTime()) return false;
        }
        if (
          search &&
          ![
            row.label,
            row.party_name,
            row.dossier_number || '',
            row.workflow_status,
          ]
            .join(' ')
            .toLocaleLowerCase('fr')
            .includes(search)
        )
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
  }

  private mapSupplierInvoice(
    invoice: SupplierInvoice,
    billingByKey: Map<string, BillableItemStatus>,
  ): ExpenseWorkspaceRow {
    const isRebillable = Boolean(invoice.is_rebillable && invoice.dossier_id);
    const kind = !isRebillable
      ? 'INTERNAL'
      : invoice.rebilling_type === ExpenseRebillingType.DISBURSEMENT
        ? 'DISBURSEMENT'
        : 'EXPENSE';
    return {
      row_id: `SUPPLIER_INVOICE:${invoice.id}`,
      source_type: ExpenseWorkspaceOrigin.SUPPLIER_INVOICE,
      source_id: invoice.id,
      parent_id: null,
      occurred_at: invoice.invoice_date,
      kind,
      label: invoice.description?.trim() || invoice.invoice_number,
      party_name: invoice.supplier?.company_name || 'Fournisseur',
      supplier_id: invoice.supplier_id,
      employee_id: null,
      dossier_id: invoice.dossier_id ?? null,
      dossier_number: invoice.dossier?.dossier_number ?? null,
      action_id: invoice.action_id ?? null,
      amount_ht: Number(invoice.amount_ht || 0),
      tax_rate: Number(invoice.tax_rate || 0),
      amount_ttc: Number(invoice.amount_ttc || 0),
      currency: invoice.currency || 'XAF',
      workflow_status: invoice.status,
      billing_status:
        billingByKey.get(`SUPPLIER_INVOICE:${invoice.id}:APPROVED`) ?? null,
      is_rebillable: isRebillable,
      attachment_url: invoice.attachment_url ?? null,
      detail_href: `/supplier-invoices/${invoice.id}`,
    };
  }

  private mapExpenseLine(
    line: ExpenseLine,
    billingByKey: Map<string, BillableItemStatus>,
  ): ExpenseWorkspaceRow {
    const report = line.expense_report;
    const isRebillable = Boolean(line.is_rebillable && line.dossier_id);
    const kind = !isRebillable
      ? 'INTERNAL'
      : line.rebilling_type === ExpenseRebillingType.DISBURSEMENT
        ? 'DISBURSEMENT'
        : 'EXPENSE';
    return {
      row_id: `EXPENSE_LINE:${line.id}`,
      source_type: ExpenseWorkspaceOrigin.EMPLOYEE_REPORT,
      source_id: line.id,
      parent_id: line.expense_report_id,
      occurred_at: line.expense_date,
      kind,
      label: line.description,
      party_name: report?.employee?.full_name || 'Collaborateur',
      supplier_id: null,
      employee_id: report?.employee_id ?? null,
      dossier_id: line.dossier_id ?? null,
      dossier_number: line.dossier?.dossier_number ?? null,
      action_id: line.action_id ?? null,
      amount_ht: Number(line.amount_ht || 0),
      tax_rate: Number(line.tax_rate || 0),
      amount_ttc: Number(line.amount_ttc || 0),
      currency: line.currency || 'XAF',
      workflow_status: report?.status || ExpenseReportStatus.DRAFT,
      billing_status:
        billingByKey.get(`EXPENSE:${line.id}:APPROVED`) ?? null,
      is_rebillable: isRebillable,
      attachment_url: line.attachment_url ?? null,
      detail_href: `/expense-reports/${line.expense_report_id}`,
    };
  }

  private async createSupplierInvoice(
    dto: CreateUnifiedExpenseDto,
    user: AuthenticatedUser,
  ) {
    const input = dto.supplier_invoice;
    if (!input) throw new BadRequestException('Les données fournisseur sont requises');
    const actorUserId = Number(user.userId ?? user.id);
    const tenantId = getCurrentTenantId();
    const approved = dto.finalization === ExpenseWorkspaceFinalization.APPROVE;
    const saved = await this.dataSource.transaction(async (manager) => {
      const supplier = await manager.getRepository(Supplier).findOne({
        where: { id: input.supplier_id, tenant_id: tenantId },
      });
      if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
      let branch: Branch | null = null;
      if (input.branch_id) {
        branch = await manager.getRepository(Branch).findOne({
          where: { id: input.branch_id, tenant_id: tenantId },
        });
        if (!branch) throw new NotFoundException('Agence non trouvée');
      }
      const dossier = await this.resolveDossierAndAction(
        manager,
        dto.dossier_id,
        dto.action_id,
      );
      const amountHt = this.round(input.amount_ht);
      const taxRate = Number(input.tax_rate || 0);
      const amountTva = this.round((amountHt * taxRate) / 100);
      const repository = manager.getRepository(SupplierInvoice);
      const invoice = repository.create({
        ...input,
        tenant_id: tenantId,
        invoice_number: input.invoice_number?.trim() || generateEntityCode('FF'),
        amount_ht: amountHt,
        tax_rate: taxRate,
        amount_tva: amountTva,
        amount_ttc: this.round(amountHt + amountTva),
        status: approved
          ? SupplierInvoiceStatus.APPROVED
          : SupplierInvoiceStatus.RECEIVED,
        created_by_id: actorUserId,
        supplier,
        branch: branch ?? undefined,
        dossier: dossier ?? undefined,
        dossier_id:
          dto.target === ExpenseWorkspaceTarget.DOSSIER
            ? dto.dossier_id!
            : null,
        action_id:
          dto.target === ExpenseWorkspaceTarget.DOSSIER
            ? dto.action_id ?? null
            : null,
        is_rebillable: dto.target === ExpenseWorkspaceTarget.DOSSIER,
        rebilling_type:
          dto.rebilling_type ?? ExpenseRebillingType.EXPENSE,
        currency: dto.currency || 'XAF',
      });
      const result = await repository.save(invoice);
      if (approved && result.is_rebillable) {
        await this.caseBillingService.syncSupplierInvoiceToBillableItem(
          manager,
          result,
          actorUserId,
          true,
        );
      }
      return result;
    });
    if (approved) {
      this.eventEmitter.emit('supplier_invoice.approuvee', saved);
    }
    return {
      source_type: ExpenseWorkspaceOrigin.SUPPLIER_INVOICE,
      id: saved.id,
      detail_href: `/supplier-invoices/${saved.id}`,
    };
  }

  private async createExpenseReport(
    dto: CreateUnifiedExpenseDto,
    user: AuthenticatedUser,
  ) {
    const input = dto.expense_report;
    if (!input) throw new BadRequestException('Les données de note de frais sont requises');
    if (!input.lines?.length) {
      throw new BadRequestException('Ajoutez au moins une ligne de dépense');
    }
    const actorUserId = Number(user.userId ?? user.id);
    const tenantId = getCurrentTenantId();
    await this.checkExpenseQuota(tenantId);
    const approved = dto.finalization === ExpenseWorkspaceFinalization.APPROVE;
    const saved = await this.dataSource.transaction(async (manager) => {
      const employee = await manager.getRepository(Employee).findOne({
        where: { id: input.employee_id, tenant_id: tenantId },
      });
      if (!employee) throw new NotFoundException('Collaborateur non trouvé');
      const dossier = await this.resolveDossierAndAction(
        manager,
        dto.dossier_id,
        dto.action_id,
      );
      const normalizedLines = input.lines.map((line) => {
        const amountHt = this.round(line.amount_ht);
        const taxRate = Number(line.tax_rate || 0);
        return {
          ...line,
          amount_ht: amountHt,
          tax_rate: taxRate,
          amount_ttc: this.round(amountHt + (amountHt * taxRate) / 100),
        };
      });
      const total = this.round(
        normalizedLines.reduce((sum, line) => sum + line.amount_ttc, 0),
      );
      const reportRepository = manager.getRepository(ExpenseReport);
      const report = await reportRepository.save(
        reportRepository.create({
          tenant_id: tenantId,
          employee_id: input.employee_id,
          employee,
          title: input.title.trim(),
          total_amount: total,
          submission_date: new Date(input.submission_date),
          notes: input.notes,
          status: approved
            ? ExpenseReportStatus.APPROVED
            : ExpenseReportStatus.SUBMITTED,
          approved_by_id: approved ? actorUserId : undefined,
        }),
      );
      const lineRepository = manager.getRepository(ExpenseLine);
      const lines: ExpenseLine[] = [];
      for (const inputLine of normalizedLines) {
        const line = await lineRepository.save(
          lineRepository.create({
            tenant_id: tenantId,
            expense_report_id: report.id,
            expense_report: report,
            expense_date: new Date(inputLine.expense_date),
            description: inputLine.description.trim(),
            category: inputLine.category,
            amount_ht: inputLine.amount_ht,
            tax_rate: inputLine.tax_rate,
            amount_ttc: inputLine.amount_ttc,
            attachment_url: inputLine.attachment_url ?? null,
            is_rebillable: dto.target === ExpenseWorkspaceTarget.DOSSIER,
            rebilling_type:
              dto.rebilling_type ?? ExpenseRebillingType.EXPENSE,
            dossier_id:
              dto.target === ExpenseWorkspaceTarget.DOSSIER
                ? dto.dossier_id!
                : undefined,
            dossier: dossier ?? undefined,
            action_id:
              dto.target === ExpenseWorkspaceTarget.DOSSIER
                ? dto.action_id ?? null
                : null,
            currency: dto.currency || 'XAF',
          }),
        );
        line.expense_report = report;
        lines.push(line);
        if (approved && line.is_rebillable) {
          await this.caseBillingService.syncExpenseLineToBillableItem(
            manager,
            line,
            actorUserId,
            true,
          );
        }
      }
      report.lines = lines;
      return report;
    });
    return {
      source_type: ExpenseWorkspaceOrigin.EMPLOYEE_REPORT,
      id: saved.id,
      detail_href: `/expense-reports/${saved.id}`,
    };
  }

  private assertTarget(dto: CreateUnifiedExpenseDto): void {
    if (dto.target === ExpenseWorkspaceTarget.DOSSIER && !dto.dossier_id) {
      throw new BadRequestException('Le dossier est obligatoire');
    }
    if (
      dto.target === ExpenseWorkspaceTarget.DOSSIER &&
      !dto.rebilling_type
    ) {
      throw new BadRequestException('La nature Frais ou Débours est obligatoire');
    }
    if (dto.target === ExpenseWorkspaceTarget.INTERNAL && dto.action_id) {
      throw new BadRequestException(
        'Une action ne peut être associée qu’à une dépense de dossier',
      );
    }
  }

  private assertCreatePermission(
    dto: CreateUnifiedExpenseDto,
    user: AuthenticatedUser,
  ): void {
    if (String(user.role).toLowerCase() === 'admin') return;
    const permissions = user.permissions || [];
    const createPermission =
      dto.origin === ExpenseWorkspaceOrigin.SUPPLIER_INVOICE
        ? 'create_supplier_invoice'
        : 'create_expense_report';
    if (!permissions.includes(createPermission)) {
      throw new ForbiddenException('Vous ne pouvez pas créer ce type de dépense');
    }
    if (dto.finalization === ExpenseWorkspaceFinalization.APPROVE) {
      const approvalPermission =
        dto.origin === ExpenseWorkspaceOrigin.SUPPLIER_INVOICE
          ? 'edit_supplier_invoice'
          : 'validate_expense_report';
      if (
        !permissions.includes(approvalPermission) ||
        (dto.target === ExpenseWorkspaceTarget.DOSSIER &&
          !permissions.includes('manage_billable_items'))
      ) {
        throw new ForbiddenException(
          'Vous ne pouvez pas approuver immédiatement cette dépense',
        );
      }
    }
  }

  private async resolveDossierAndAction(
    manager: import('typeorm').EntityManager,
    dossierId?: number,
    actionId?: string,
  ): Promise<Dossier | null> {
    if (!dossierId) return null;
    const tenantId = getCurrentTenantId();
    const dossier = await manager.getRepository(Dossier).findOne({
      where: { id: dossierId, tenant_id: tenantId },
    });
    if (!dossier) throw new NotFoundException('Dossier non trouvé');
    if (actionId) {
      const action = await manager.getRepository(DossierAction).findOne({
        where: { id: actionId, dossier_id: dossierId, tenant_id: tenantId },
      });
      if (!action) {
        throw new BadRequestException(
          'L’action associée n’appartient pas au dossier sélectionné',
        );
      }
    }
    return dossier;
  }

  private async checkExpenseQuota(tenantId: number): Promise<void> {
    await this.planQuotaService.checkModuleEnabled(tenantId, 'expenses');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const currentCount = await this.expenseReportRepository.count({
      where: { tenant_id: tenantId, created_at: MoreThanOrEqual(monthStart) },
    });
    await this.planQuotaService.checkLimit(
      tenantId,
      'expenses',
      currentCount,
    );
  }

  private round(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }
}
