import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { ExpenseLine } from './entities/expense-line.entity';
import { CreateExpenseLineDto } from './dto/create-expense-line.dto';
import { UpdateExpenseLineDto } from './dto/update-expense-line.dto';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { AuditService } from 'src/core/audit/audit.service';
import { SupplierEvidenceStorageService } from './supplier-evidence-storage.service';

export interface ExpenseEvidenceActor {
  userId?: number | null;
}

@Injectable()
export class ExpenseLinesService {
  constructor(
    @InjectRepository(ExpenseLine)
    private readonly repository: Repository<ExpenseLine>,
    @InjectRepository(ExpenseReport)
    private readonly reportRepo: Repository<ExpenseReport>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly evidenceStorage: SupplierEvidenceStorageService,
  ) {}

  async create(dto: CreateExpenseLineDto): Promise<ExpenseLine> {
    const report = await this.findMutableReport(dto.expense_report_id);
    const dossier = await this.resolveDossier(
      dto.dossier_id,
      dto.is_rebillable,
    );
    this.assertAmounts(dto.amount_ht, dto.tax_rate, dto.amount_ttc);
    const entity = this.repository.create();
    Object.assign(entity, {
      ...dto,
      expense_date: new Date(dto.expense_date),
      expense_report: report,
      expense_report_id: report.id,
      dossier,
      dossier_id: dossier?.id ?? null,
      is_rebillable: dto.is_rebillable ?? false,
      attachment_url: null,
      tenant_id: getCurrentTenantId(),
    });
    return this.repository.save(entity);
  }

  findByReport(reportId: number): Promise<ExpenseLine[]> {
    return this.repository.find({
      where: {
        expense_report_id: reportId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['dossier'],
      order: { expense_date: 'ASC' },
    });
  }

  async findOne(id: number): Promise<ExpenseLine> {
    const line = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: ['expense_report', 'dossier'],
    });
    if (!line) {
      throw new NotFoundException('Ligne de dépense non trouvée');
    }
    return line;
  }

  async update(
    id: number,
    dto: UpdateExpenseLineDto,
  ): Promise<ExpenseLine> {
    const line = await this.findOne(id);
    await this.assertMutable(line.expense_report);
    const amountHt = dto.amount_ht ?? Number(line.amount_ht);
    const taxRate = dto.tax_rate ?? Number(line.tax_rate);
    const amountTtc = dto.amount_ttc ?? Number(line.amount_ttc);
    this.assertAmounts(amountHt, taxRate, amountTtc);

    const isRebillable =
      dto.is_rebillable ?? Boolean(line.is_rebillable);
    const dossier = await this.resolveDossier(
      dto.dossier_id ?? line.dossier_id,
      isRebillable,
    );
    Object.assign(line, {
      ...dto,
      expense_date: dto.expense_date
        ? new Date(dto.expense_date)
        : line.expense_date,
      amount_ht: amountHt,
      tax_rate: taxRate,
      amount_ttc: amountTtc,
      is_rebillable: isRebillable,
      dossier,
      dossier_id: dossier?.id ?? null,
      expense_report_id: line.expense_report_id,
      expense_report: line.expense_report,
      attachment_url: line.attachment_url,
      tenant_id: line.tenant_id,
    });
    return this.repository.save(line);
  }

  async remove(id: number): Promise<void> {
    const line = await this.findOne(id);
    await this.assertMutable(line.expense_report);
    await this.repository.delete({
      id: line.id,
      tenant_id: getCurrentTenantId(),
    });
    await this.evidenceStorage.remove(line.attachment_url);
  }

  async attachEvidence(
    id: number,
    file: Express.Multer.File,
    actor: ExpenseEvidenceActor,
  ): Promise<ExpenseLine> {
    const actorId = this.requireActor(actor);
    const stored = await this.evidenceStorage.store(file, 'expense');
    let previousStorageKey: string | null = null;
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const line = await manager.getRepository(ExpenseLine).findOne({
          where: { id, tenant_id: getCurrentTenantId() },
          relations: ['expense_report', 'dossier'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!line) {
          throw new NotFoundException('Ligne de dépense non trouvée');
        }
        await this.assertMutable(line.expense_report);
        previousStorageKey = line.attachment_url;
        Object.assign(line, {
          attachment_url: stored.storageKey,
          attachment_original_name: stored.originalName,
          attachment_mime_type: stored.mimeType,
          attachment_size: String(stored.size),
          attachment_sha256: stored.sha256,
        });
        const result = await manager.getRepository(ExpenseLine).save(line);
        await this.auditService.append(manager, {
          actorId,
          action: 'expense_line.evidence.attached',
          resourceType: 'expense_line',
          resourceId: result.id,
          dossierId: result.dossier_id,
          afterState: {
            filename: stored.originalName,
            mimeType: stored.mimeType,
            size: stored.size,
            sha256: stored.sha256,
          },
        });
        return result;
      });
      if (previousStorageKey && previousStorageKey !== stored.storageKey) {
        await this.evidenceStorage.remove(previousStorageKey);
      }
      return saved;
    } catch (error) {
      await this.evidenceStorage.remove(stored.storageKey);
      throw error;
    }
  }

  async getEvidence(
    id: number,
    actor: ExpenseEvidenceActor,
  ): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    sha256: string;
  }> {
    const actorId = this.requireActor(actor);
    const line = await this.findOne(id);
    if (
      !line.attachment_url ||
      !line.attachment_original_name ||
      !line.attachment_mime_type ||
      !line.attachment_sha256
    ) {
      throw new NotFoundException('Justificatif de dépense absent');
    }
    const buffer = await this.evidenceStorage.read(line.attachment_url);
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId,
        action: 'expense_line.evidence.downloaded',
        resourceType: 'expense_line',
        resourceId: line.id,
        dossierId: line.dossier_id,
        afterState: { sha256: line.attachment_sha256 },
      }),
    );
    return {
      buffer,
      filename: line.attachment_original_name,
      mimeType: line.attachment_mime_type,
      sha256: line.attachment_sha256,
    };
  }

  private async findMutableReport(id: number): Promise<ExpenseReport> {
    const report = await this.reportRepo.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
    });
    if (!report) throw new NotFoundException('Note de frais non trouvée');
    await this.assertMutable(report);
    return report;
  }

  private async assertMutable(report: ExpenseReport): Promise<void> {
    if (
      ![
        ExpenseReportStatus.DRAFT,
        ExpenseReportStatus.REJECTED,
      ].includes(report.status)
    ) {
      throw new BadRequestException(
        'Les lignes sont verrouillées dès la soumission de la note',
      );
    }
  }

  private async resolveDossier(
    dossierId?: number | null,
    isRebillable = false,
  ): Promise<Dossier | null> {
    if (isRebillable && !dossierId) {
      throw new BadRequestException(
        'Une dépense refacturable doit être rattachée à un dossier',
      );
    }
    if (!dossierId) return null;
    const dossier = await this.dossierRepo.findOne({
      where: { id: dossierId, tenant_id: getCurrentTenantId() },
    });
    if (!dossier) throw new NotFoundException('Dossier non trouvé');
    return dossier;
  }

  private assertAmounts(
    amountHt: number,
    taxRate: number,
    amountTtc: number,
  ): void {
    const ht = this.toMinorUnits(amountHt);
    const ttc = this.toMinorUnits(amountTtc);
    const rate = Number(taxRate);
    if (
      ht <= 0 ||
      ttc <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100
    ) {
      throw new BadRequestException('Montants de dépense invalides');
    }
    const expectedTtc = ht + Math.round((ht * rate) / 100);
    if (Math.abs(expectedTtc - ttc) > 1) {
      throw new BadRequestException(
        'Le montant TTC ne correspond pas au montant HT et au taux de TVA',
      );
    }
  }

  private toMinorUnits(value: number): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Les montants utilisent au plus deux décimales',
      );
    }
    return rounded;
  }

  private requireActor(actor: ExpenseEvidenceActor): number {
    const actorId = Number(actor?.userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    return actorId;
  }
}
