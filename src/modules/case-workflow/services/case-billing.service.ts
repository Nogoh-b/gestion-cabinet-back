import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import {
  Audience,
  AudienceStatus,
} from 'src/modules/audiences/entities/audience.entity';
import {
  Diligence,
  DiligenceStatus,
} from 'src/modules/diligence/entities/diligence.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { FactureService } from 'src/modules/facture/facture.service';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import {
  StatutFacture,
  TypeFacture,
} from 'src/modules/facture/dto/create-facture.dto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ActionBillingDecision,
  BillableItemStatus,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
  BillingTrigger,
} from '../case-workflow.enums';
import {
  AdjustBillableItemDto,
  CreateDossierBillingRuleDto,
  CreateManualBillableItemDto,
  GenerateInvoiceFromItemsDto,
  ReviewBillableItemDto,
  ReviseDossierBillingRuleDto,
  UpdateBillingProfileDto,
  WaiveBillableItemDto,
} from '../dto/case-workflow.dto';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
  InvoiceLine,
} from '../entities/billing.entity';
import { DossierAction } from '../entities/dossier-action.entity';
import { CaseWorkflowEvent } from '../entities/workflow-audit.entity';
import { WorkflowEventService } from './workflow-event.service';
import { calculateActionBilling } from '../case-workflow.logic';

@Injectable()
export class CaseBillingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DossierBillingProfile)
    private readonly profileRepository: Repository<DossierBillingProfile>,
    @InjectRepository(DossierBillingRule)
    private readonly ruleRepository: Repository<DossierBillingRule>,
    @InjectRepository(BillableItem)
    private readonly itemRepository: Repository<BillableItem>,
    @InjectRepository(InvoiceLine)
    private readonly lineRepository: Repository<InvoiceLine>,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    @InjectRepository(Facture)
    private readonly factureRepository: Repository<Facture>,
    @InjectRepository(CaseWorkflowEvent)
    private readonly eventRepository: Repository<CaseWorkflowEvent>,
    private readonly factureService: FactureService,
    private readonly eventService: WorkflowEventService,
  ) {}

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isDuplicateError(error: unknown): boolean {
    const candidate = error as {
      code?: unknown;
      errno?: unknown;
      driverError?: { code?: unknown; errno?: unknown };
    };
    return (
      candidate.code === 'ER_DUP_ENTRY' ||
      candidate.errno === 1062 ||
      candidate.driverError?.code === 'ER_DUP_ENTRY' ||
      candidate.driverError?.errno === 1062
    );
  }

  async getProfile(dossierId: number): Promise<DossierBillingProfile> {
    const tenantId = getCurrentTenantId();
    const existing = await this.profileRepository.findOne({
      where: { tenant_id: tenantId, dossier_id: dossierId },
    });
    if (existing) return existing;

    const [dossier, cabinet] = await Promise.all([
      this.dossierRepository.findOne({
        where: { id: dossierId, tenant_id: tenantId },
      }),
      this.cabinetRepository.findOne({ where: { id: tenantId } }),
    ]);
    if (!dossier)
      throw new NotFoundException(`Dossier ${dossierId} introuvable`);
    try {
      return await this.profileRepository.save(
        this.profileRepository.create({
          tenant_id: tenantId,
          dossier_id: dossierId,
          currency: cabinet?.currency ?? 'XAF',
          vat_rate: Number(cabinet?.default_tva_rate ?? 0),
          mode: BillingMode.FIXED,
          fixed_fee: null,
          hourly_rate: null,
          percentage_rate: null,
          percentage_base: null,
          opening_fee: cabinet?.dossier_opening_fee_enabled
            ? Number(cabinet.dossier_opening_fee)
            : null,
          is_confirmed: false,
        }),
      );
    } catch (error) {
      if (!this.isDuplicateError(error)) throw error;
      const concurrent = await this.profileRepository.findOne({
        where: { tenant_id: tenantId, dossier_id: dossierId },
      });
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  async updateProfile(
    dossierId: number,
    dto: UpdateBillingProfileDto,
  ): Promise<DossierBillingProfile> {
    const profile = await this.getProfile(dossierId);
    if (
      dto.expected_version != null &&
      dto.expected_version !== profile.lock_version
    ) {
      throw new ConflictException(
        'Le profil de facturation a été modifié. Rechargez le dossier.',
      );
    }
    const changes = { ...dto };
    delete changes.expected_version;
    Object.assign(profile, changes);
    return this.profileRepository.save(profile);
  }

  async listRules(dossierId: number): Promise<DossierBillingRule[]> {
    const tenantId = getCurrentTenantId();
    await this.assertDossier(dossierId, tenantId);
    return this.ruleRepository.find({
      where: { tenant_id: tenantId, dossier_id: dossierId },
      order: { code: 'ASC', version: 'DESC' },
    });
  }

  async createRule(
    dossierId: number,
    dto: CreateDossierBillingRuleDto,
  ): Promise<DossierBillingRule> {
    const tenantId = getCurrentTenantId();
    await this.assertDossier(dossierId, tenantId);
    this.validateRule(dto);
    const code = dto.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_');
    const latest = await this.ruleRepository.findOne({
      where: { tenant_id: tenantId, dossier_id: dossierId, code },
      order: { version: 'DESC' },
    });
    if (latest)
      throw new ConflictException(
        `La règle ${code} existe déjà. Utilisez la révision.`,
      );
    return this.ruleRepository.save(
      this.ruleRepository.create({
        tenant_id: tenantId,
        dossier_id: dossierId,
        code,
        version: 1,
        trigger: dto.trigger,
        calculation_mode: dto.calculation_mode,
        rate: dto.rate ?? null,
        base_field: dto.base_field?.trim() || null,
        action_definition_code: dto.action_definition_code?.trim() || null,
        fee_type: dto.fee_type.trim(),
        is_active: dto.is_active ?? true,
      }),
    );
  }

  async reviseRule(
    ruleId: string,
    dto: ReviseDossierBillingRuleDto,
  ): Promise<DossierBillingRule> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DossierBillingRule);
      const current = await repository
        .createQueryBuilder('rule')
        .setLock('pessimistic_write')
        .where('rule.id = :ruleId AND rule.tenant_id = :tenantId', {
          ruleId,
          tenantId,
        })
        .getOne();
      if (!current)
        throw new NotFoundException('Règle de facturation introuvable');
      if (current.lock_version !== dto.expected_version) {
        throw new ConflictException(
          'La règle de facturation a été modifiée. Rechargez le dossier.',
        );
      }
      const next = {
        trigger: dto.trigger ?? current.trigger,
        calculation_mode: dto.calculation_mode ?? current.calculation_mode,
        rate: dto.rate === undefined ? current.rate : dto.rate,
        base_field:
          dto.base_field === undefined
            ? current.base_field
            : dto.base_field.trim() || null,
        action_definition_code:
          dto.action_definition_code === undefined
            ? current.action_definition_code
            : dto.action_definition_code.trim() || null,
        fee_type: dto.fee_type?.trim() || current.fee_type,
        is_active: dto.is_active ?? current.is_active,
      };
      this.validateRule(next);
      current.is_active = false;
      await repository.save(current);
      return repository.save(
        repository.create({
          tenant_id: tenantId,
          dossier_id: current.dossier_id,
          code: current.code,
          version: current.version + 1,
          ...next,
        }),
      );
    });
  }

  private validateRule(rule: {
    calculation_mode: BillingCalculationMode;
    rate?: number | null;
    base_field?: string | null;
  }): void {
    if (
      [
        BillingCalculationMode.FIXED,
        BillingCalculationMode.HOURLY,
        BillingCalculationMode.EXPENSE,
      ].includes(rule.calculation_mode) &&
      (rule.rate == null || Number(rule.rate) < 0)
    ) {
      throw new ConflictException('Un tarif est requis pour ce mode de calcul');
    }
    if (
      rule.calculation_mode === BillingCalculationMode.PERCENTAGE &&
      (rule.rate == null || !rule.base_field?.trim())
    ) {
      throw new ConflictException(
        'Un taux et une base sont requis pour la facturation au pourcentage',
      );
    }
  }

  private async assertDossier(
    dossierId: number,
    tenantId: number,
  ): Promise<Dossier> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId, tenant_id: tenantId },
    });
    if (!dossier)
      throw new NotFoundException(`Dossier ${dossierId} introuvable`);
    return dossier;
  }

  private async applicableRule(
    manager: EntityManager,
    dossierId: number,
    trigger: BillingTrigger,
    actionDefinitionCode?: string,
  ): Promise<DossierBillingRule | null> {
    const tenantId = getCurrentTenantId();
    const query = manager
      .getRepository(DossierBillingRule)
      .createQueryBuilder('rule')
      .where('rule.tenant_id = :tenantId', { tenantId })
      .andWhere('rule.dossier_id = :dossierId', { dossierId })
      .andWhere('rule.trigger = :trigger', { trigger })
      .andWhere('rule.is_active = 1');
    if (actionDefinitionCode) {
      query
        .andWhere(
          '(rule.action_definition_code = :actionDefinitionCode OR rule.action_definition_code IS NULL)',
          { actionDefinitionCode },
        )
        .orderBy(
          'CASE WHEN rule.action_definition_code = :actionDefinitionCode THEN 0 ELSE 1 END',
          'ASC',
        );
    } else {
      query
        .andWhere('rule.action_definition_code IS NULL')
        .orderBy('rule.version', 'DESC');
    }
    return query.addOrderBy('rule.version', 'DESC').getOne();
  }

  private valueAtPath(
    source: Record<string, unknown> | null | undefined,
    path: string | null,
  ): number | null {
    if (!path) return null;
    let value: unknown = source;
    for (const part of path.split('.')) {
      if (!value || typeof value !== 'object') return null;
      value = (value as Record<string, unknown>)[part];
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async createOpeningItem(
    manager: EntityManager,
    dossier: Dossier,
    actorUserId: number,
  ): Promise<BillableItem | null> {
    const tenantId = getCurrentTenantId();
    const cabinet = await manager
      .getRepository(Cabinet)
      .findOne({ where: { id: tenantId } });
    const profile = await manager.getRepository(DossierBillingProfile).findOne({
      where: { tenant_id: tenantId, dossier_id: dossier.id },
    });
    const configuredAmount =
      profile?.opening_fee ??
      (cabinet?.dossier_opening_fee_enabled
        ? Number(cabinet.dossier_opening_fee)
        : null);
    if (configuredAmount == null || Number(configuredAmount) <= 0) return null;

    const repository = manager.getRepository(BillableItem);
    const sourceEventKey = `DOSSIER:${dossier.id}:OPENING_FEE`;
    const existing = await repository.findOne({
      where: { tenant_id: tenantId, source_event_key: sourceEventKey },
    });
    if (existing) return existing;
    const net = this.round(Number(configuredAmount));
    const taxRate = Number(
      profile?.vat_rate ??
        cabinet?.dossier_opening_fee_tva ??
        cabinet?.default_tva_rate ??
        0,
    );
    const tax = this.round((net * taxRate) / 100);
    const openingInvoice = await manager.getRepository(Facture).findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossier.id,
        type: TypeFacture.FRAIS_PROCEDURE,
      },
      order: { created_at: 'ASC' },
    });
    const item = await repository.save(
      repository.create({
        tenant_id: tenantId,
        dossier_id: dossier.id,
        client_id: dossier.client_id,
        source_type: BillableSourceType.OPENING_FEE,
        source_id: String(dossier.id),
        source_event_key: sourceEventKey,
        occurred_at: new Date(),
        label:
          cabinet?.dossier_opening_fee_label ?? 'Frais d’ouverture du dossier',
        quantity: 1,
        unit_price: net,
        net_amount: net,
        tax_rate: taxRate,
        tax_amount: tax,
        gross_amount: this.round(net + tax),
        currency: profile?.currency ?? cabinet?.currency ?? 'XAF',
        status: openingInvoice
          ? BillableItemStatus.INVOICED
          : BillableItemStatus.TO_INVOICE,
        calculation_snapshot: {
          mode: BillingCalculationMode.FIXED,
          configuredAmount: net,
          configuredTaxRate: taxRate,
          cabinetId: tenantId,
        },
        review_reason: null,
        reserved_at: null,
        invoice_line_id: null,
      }),
    );
    if (openingInvoice) {
      const lineRepository = manager.getRepository(InvoiceLine);
      const line = await lineRepository.save(
        lineRepository.create({
          tenant_id: tenantId,
          facture_id: openingInvoice.id,
          dossier_id: dossier.id,
          billable_item_id: item.id,
          display_order: 1,
          label: item.label,
          quantity: item.quantity,
          unit_price: item.unit_price,
          net_amount: item.net_amount,
          tax_rate: item.tax_rate,
          tax_amount: item.tax_amount,
          gross_amount: item.gross_amount,
          currency: item.currency,
          source_snapshot: {
            sourceType: item.source_type,
            sourceId: item.source_id,
            sourceEventKey: item.source_event_key,
            reconciledLegacyOpeningInvoice: true,
          },
        }),
      );
      item.invoice_line_id = line.id;
      await repository.save(item);
    }
    await this.eventService.append(manager, {
      dossierId: dossier.id,
      eventType: 'BILLABLE_ITEM_CREATED',
      aggregateType: 'BillableItem',
      aggregateId: item.id,
      actorUserId,
      payload: { sourceType: item.source_type, amount: item.gross_amount },
      idempotencyKey: `EVENT:${sourceEventKey}`,
    });
    return item;
  }

  async createForCompletedAction(
    manager: EntityManager,
    action: DossierAction,
    actorUserId: number,
  ): Promise<BillableItem | null> {
    if (action.billing_decision === ActionBillingDecision.NON_BILLABLE)
      return null;
    const tenantId = getCurrentTenantId();
    const repository = manager.getRepository(BillableItem);
    const sourceEventKey = `ACTION:${action.id}:COMPLETED`;
    const existing = await repository.findOne({
      where: { tenant_id: tenantId, source_event_key: sourceEventKey },
    });
    if (existing) return existing;

    const dossier = await manager.getRepository(Dossier).findOne({
      where: { id: action.dossier_id, tenant_id: tenantId },
    });
    if (!dossier)
      throw new NotFoundException(`Dossier ${action.dossier_id} introuvable`);
    const profile = await manager.getRepository(DossierBillingProfile).findOne({
      where: { tenant_id: tenantId, dossier_id: action.dossier_id },
    });
    const definition = action.definition;
    const rule = await this.applicableRule(
      manager,
      action.dossier_id,
      BillingTrigger.ACTION_COMPLETED,
      action.definition_code,
    );
    const calculationMode =
      rule?.calculation_mode ?? definition?.billing_mode ?? null;
    const taxRate = Number(profile?.vat_rate ?? 0);
    const ruleBase = this.valueAtPath(
      action.specific_data,
      rule?.base_field ?? null,
    );
    const calculation = calculateActionBilling({
      decision: action.billing_decision,
      mode: calculationMode,
      durationMinutes: action.duration_minutes,
      definitionRate: rule?.rate ?? definition?.default_rate,
      hourlyRate:
        calculationMode === BillingCalculationMode.HOURLY && rule?.rate != null
          ? rule.rate
          : profile?.hourly_rate,
      fixedFee:
        calculationMode === BillingCalculationMode.FIXED && rule?.rate != null
          ? rule.rate
          : profile?.fixed_fee,
      percentageRate:
        calculationMode === BillingCalculationMode.PERCENTAGE &&
        rule?.rate != null
          ? rule.rate
          : profile?.percentage_rate,
      percentageBase: ruleBase ?? profile?.percentage_base,
      taxRate,
      decisionReason: action.billing_reason,
    });
    const item = await repository.save(
      repository.create({
        tenant_id: tenantId,
        dossier_id: dossier.id,
        client_id: dossier.client_id,
        source_type: BillableSourceType.ACTION,
        source_id: action.id,
        source_event_key: sourceEventKey,
        occurred_at: action.completed_at ?? new Date(),
        label: action.definition_label,
        quantity: calculation.quantity,
        unit_price: calculation.unitPrice,
        net_amount: calculation.net,
        tax_rate: taxRate,
        tax_amount: calculation.tax,
        gross_amount: calculation.gross,
        currency: profile?.currency ?? 'XAF',
        status: calculation.reviewReason
          ? BillableItemStatus.NEEDS_REVIEW
          : BillableItemStatus.TO_INVOICE,
        calculation_snapshot: {
          definitionCode: action.definition_code,
          definitionVersion: action.definition_version,
          billingRuleId: rule?.id ?? null,
          billingRuleVersion: rule?.version ?? null,
          feeType: rule?.fee_type ?? null,
          mode: calculationMode,
          durationMinutes: action.duration_minutes,
          quantity: calculation.quantity,
          unitPrice: calculation.unitPrice,
          taxRate,
        },
        review_reason: calculation.reviewReason,
        reserved_at: null,
        invoice_line_id: null,
      }),
    );
    await this.eventService.append(manager, {
      dossierId: dossier.id,
      eventType: 'BILLABLE_ITEM_CREATED',
      aggregateType: 'BillableItem',
      aggregateId: item.id,
      actorUserId,
      payload: {
        actionId: action.id,
        status: item.status,
        amount: item.gross_amount,
      },
      idempotencyKey: `EVENT:${sourceEventKey}`,
    });
    return item;
  }

  async syncAudienceItems(dossierId: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const audiences = await this.dataSource.getRepository(Audience).find({
      where: { tenant_id: tenantId, dossier_id: String(dossierId) },
    });
    for (const audience of audiences) {
      await this.createAudienceItem(audience, BillingTrigger.AUDIENCE_CREATED);
      if (audience.status === AudienceStatus.HELD) {
        await this.createAudienceItem(audience, BillingTrigger.AUDIENCE_HELD);
      }
    }
  }

  async syncAudienceEvent(
    audienceId: number,
    trigger: BillingTrigger.AUDIENCE_CREATED | BillingTrigger.AUDIENCE_HELD,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    const audience = await this.dataSource.getRepository(Audience).findOne({
      where: { id: audienceId, tenant_id: tenantId },
    });
    if (audience) await this.createAudienceItem(audience, trigger);
  }

  private async createAudienceItem(
    audience: Audience,
    trigger: BillingTrigger.AUDIENCE_CREATED | BillingTrigger.AUDIENCE_HELD,
  ): Promise<void> {
    try {
      await this.dataSource.transaction((manager) =>
        this.createForAudience(manager, audience, trigger),
      );
    } catch (error) {
      if (!this.isDuplicateError(error)) throw error;
    }
  }

  async syncDiligenceItems(dossierId: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const diligences = await this.dataSource.getRepository(Diligence).find({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: DiligenceStatus.COMPLETED,
      },
    });
    for (const diligence of diligences) {
      await this.dataSource.transaction(async (manager) => {
        const rule = await this.applicableRule(
          manager,
          dossierId,
          BillingTrigger.DILIGENCE_COMPLETED,
        );
        if (!rule) return;
        const repository = manager.getRepository(BillableItem);
        const sourceEventKey = `DILIGENCE:${diligence.id}:COMPLETED:RULE:${rule.id}`;
        if (
          await repository.findOne({
            where: { tenant_id: tenantId, source_event_key: sourceEventKey },
          })
        )
          return;
        const [dossier, profile] = await Promise.all([
          manager
            .getRepository(Dossier)
            .findOne({ where: { id: dossierId, tenant_id: tenantId } }),
          manager
            .getRepository(DossierBillingProfile)
            .findOne({ where: { tenant_id: tenantId, dossier_id: dossierId } }),
        ]);
        if (!dossier) return;
        let quantity =
          rule.calculation_mode === BillingCalculationMode.HOURLY
            ? Number(diligence.actual_hours ?? 0)
            : 1;
        let unitPrice = Number(rule.rate ?? 0);
        let reviewReason: string | null = null;
        if (rule.calculation_mode === BillingCalculationMode.PERCENTAGE) {
          quantity = Number(profile?.percentage_base ?? 0);
          unitPrice = Number(rule.rate ?? 0) / 100;
          if (!quantity)
            reviewReason = `Base de calcul « ${rule.base_field ?? 'pourcentage'} » manquante`;
        } else if (
          rule.calculation_mode === BillingCalculationMode.HOURLY &&
          !quantity
        ) {
          reviewReason = 'Heures réelles de la diligence manquantes';
        }
        if (!unitPrice)
          reviewReason = reviewReason ?? 'Tarif de la diligence manquant';
        const net = this.round(quantity * unitPrice);
        const taxRate = Number(profile?.vat_rate ?? 0);
        const tax = this.round((net * taxRate) / 100);
        const item = await repository.save(
          repository.create({
            tenant_id: tenantId,
            dossier_id: dossierId,
            client_id: dossier.client_id,
            source_type: BillableSourceType.DILIGENCE,
            source_id: String(diligence.id),
            source_event_key: sourceEventKey,
            occurred_at: diligence.completion_date ?? new Date(),
            label: diligence.title,
            quantity,
            unit_price: unitPrice,
            net_amount: net,
            tax_rate: taxRate,
            tax_amount: tax,
            gross_amount: this.round(net + tax),
            currency: profile?.currency ?? 'XAF',
            status: reviewReason
              ? BillableItemStatus.NEEDS_REVIEW
              : BillableItemStatus.TO_INVOICE,
            calculation_snapshot: {
              billingRuleId: rule.id,
              billingRuleVersion: rule.version,
              mode: rule.calculation_mode,
              actualHours: diligence.actual_hours,
              feeType: rule.fee_type,
            },
            review_reason: reviewReason,
            reserved_at: null,
            invoice_line_id: null,
          }),
        );
        await this.eventService.append(manager, {
          dossierId,
          eventType: 'BILLABLE_ITEM_CREATED',
          aggregateType: 'BillableItem',
          aggregateId: item.id,
          actorUserId: null,
          payload: {
            diligenceId: diligence.id,
            status: item.status,
            amount: item.gross_amount,
          },
          idempotencyKey: `EVENT:${sourceEventKey}`,
        });
      });
    }
  }

  private async createForAudience(
    manager: EntityManager,
    audience: Audience,
    trigger: BillingTrigger.AUDIENCE_CREATED | BillingTrigger.AUDIENCE_HELD,
  ): Promise<BillableItem | null> {
    const tenantId = getCurrentTenantId();
    const dossierId = Number(audience.dossier_id);
    const rule = await this.applicableRule(manager, dossierId, trigger);
    if (!rule) return null;
    const repository = manager.getRepository(BillableItem);
    const sourceEventKey = `AUDIENCE:${audience.id}:${trigger}:RULE:${rule.id}`;
    const existing = await repository.findOne({
      where: { tenant_id: tenantId, source_event_key: sourceEventKey },
    });
    if (existing) return existing;
    const [dossier, profile] = await Promise.all([
      manager
        .getRepository(Dossier)
        .findOne({ where: { id: dossierId, tenant_id: tenantId } }),
      manager
        .getRepository(DossierBillingProfile)
        .findOne({ where: { tenant_id: tenantId, dossier_id: dossierId } }),
    ]);
    if (!dossier) return null;

    let quantity = 1;
    let unitPrice = Number(rule.rate ?? 0);
    let reviewReason: string | null = null;
    if (rule.calculation_mode === BillingCalculationMode.HOURLY) {
      quantity = Number(audience.duration_minutes ?? 0) / 60;
      if (!quantity) reviewReason = 'Durée de l’audience manquante';
    } else if (rule.calculation_mode === BillingCalculationMode.PERCENTAGE) {
      quantity = Number(profile?.percentage_base ?? 0);
      unitPrice = Number(rule.rate ?? 0) / 100;
      if (!quantity)
        reviewReason = `Base de calcul « ${rule.base_field ?? 'pourcentage'} » manquante`;
    }
    if (!unitPrice)
      reviewReason = reviewReason ?? 'Tarif de l’audience manquant';
    const net = this.round(quantity * unitPrice);
    const taxRate = Number(profile?.vat_rate ?? 0);
    const tax = this.round((net * taxRate) / 100);
    const item = await repository.save(
      repository.create({
        tenant_id: tenantId,
        dossier_id: dossierId,
        client_id: dossier.client_id,
        source_type: BillableSourceType.AUDIENCE,
        source_id: String(audience.id),
        source_event_key: sourceEventKey,
        occurred_at:
          trigger === BillingTrigger.AUDIENCE_CREATED
            ? audience.created_at
            : new Date(audience.audience_date),
        label:
          trigger === BillingTrigger.AUDIENCE_CREATED
            ? `CrÃ©ation de l'audience du ${new Date(audience.audience_date).toLocaleDateString('fr-FR')}`
            : `Audience du ${new Date(audience.audience_date).toLocaleDateString('fr-FR')}`,
        quantity,
        unit_price: unitPrice,
        net_amount: net,
        tax_rate: taxRate,
        tax_amount: tax,
        gross_amount: this.round(net + tax),
        currency: profile?.currency ?? 'XAF',
        status: reviewReason
          ? BillableItemStatus.NEEDS_REVIEW
          : BillableItemStatus.TO_INVOICE,
        calculation_snapshot: {
          billingRuleId: rule.id,
          billingRuleVersion: rule.version,
          trigger,
          mode: rule.calculation_mode,
          durationMinutes: audience.duration_minutes ?? null,
          feeType: rule.fee_type,
        },
        review_reason: reviewReason,
        reserved_at: null,
        invoice_line_id: null,
      }),
    );
    await this.eventService.append(manager, {
      dossierId,
      eventType: 'BILLABLE_ITEM_CREATED',
      aggregateType: 'BillableItem',
      aggregateId: item.id,
      actorUserId: null,
      payload: {
        audienceId: audience.id,
        status: item.status,
        amount: item.gross_amount,
      },
      idempotencyKey: `EVENT:${sourceEventKey}`,
    });
    return item;
  }

  async createManualItem(
    dossierId: number,
    dto: CreateManualBillableItemDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<BillableItem> {
    const tenantId = getCurrentTenantId();
    const sourceType = dto.source_type ?? BillableSourceType.MANUAL;
    if (
      ![BillableSourceType.MANUAL, BillableSourceType.DILIGENCE].includes(
        sourceType,
      )
    ) {
      throw new ConflictException(
        'Seules une prestation manuelle ou une diligence peuvent être saisies ici',
      );
    }
    const sourceEventKey = `MANUAL:${idempotencyKey}`;
    const existing = await this.itemRepository.findOne({
      where: { tenant_id: tenantId, source_event_key: sourceEventKey },
    });
    if (existing) return existing;
    const dossier = await this.assertDossier(dossierId, tenantId);
    const profile = await this.getProfile(dossierId);
    const net = this.round(Number(dto.quantity) * Number(dto.unit_price));
    const taxRate = Number(dto.tax_rate ?? profile.vat_rate ?? 0);
    const tax = this.round((net * taxRate) / 100);
    const item = await this.itemRepository.save(
      this.itemRepository.create({
        tenant_id: tenantId,
        dossier_id: dossierId,
        client_id: dossier.client_id,
        source_type: sourceType,
        source_id: idempotencyKey,
        source_event_key: sourceEventKey,
        occurred_at: dto.occurred_at ? new Date(dto.occurred_at) : new Date(),
        label: dto.label.trim(),
        quantity: dto.quantity,
        unit_price: dto.unit_price,
        net_amount: net,
        tax_rate: taxRate,
        tax_amount: tax,
        gross_amount: this.round(net + tax),
        currency: profile.currency,
        status: BillableItemStatus.TO_INVOICE,
        calculation_snapshot: {
          mode: BillingTrigger.MANUAL,
          note: dto.note ?? null,
          actorUserId,
        },
        review_reason: null,
        reserved_at: null,
        invoice_line_id: null,
      }),
    );
    await this.eventService.append(this.itemRepository.manager, {
      dossierId,
      eventType: 'BILLABLE_ITEM_CREATED',
      aggregateType: 'BillableItem',
      aggregateId: item.id,
      actorUserId,
      payload: { sourceType, amount: item.gross_amount },
      idempotencyKey: `EVENT:${sourceEventKey}`,
    });
    return item;
  }

  async waiveItem(
    itemId: string,
    dto: WaiveBillableItemDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<BillableItem> {
    return this.mutateOpenItem(
      itemId,
      dto.expected_version,
      idempotencyKey,
      'BILLABLE_ITEM_WAIVED',
      actorUserId,
      (item) => {
        item.status = BillableItemStatus.WAIVED;
        item.review_reason = null;
        item.calculation_snapshot = {
          ...(item.calculation_snapshot ?? {}),
          waiver: {
            reason: dto.reason.trim(),
            actorUserId,
            at: new Date().toISOString(),
          },
        };
      },
    );
  }

  async adjustItem(
    itemId: string,
    dto: AdjustBillableItemDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<BillableItem> {
    if (!Number(dto.amount_delta))
      throw new ConflictException(
        'Le montant de l’ajustement ne peut pas être nul',
      );
    const tenantId = getCurrentTenantId();
    const sourceEventKey = `ADJUSTMENT:${idempotencyKey}`;
    const existing = await this.itemRepository.findOne({
      where: { tenant_id: tenantId, source_event_key: sourceEventKey },
    });
    if (existing) return existing;
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BillableItem);
      const original = await repository
        .createQueryBuilder('item')
        .setLock('pessimistic_write')
        .where('item.id = :itemId AND item.tenant_id = :tenantId', {
          itemId,
          tenantId,
        })
        .getOne();
      if (!original)
        throw new NotFoundException('Élément facturable introuvable');
      if (original.lock_version !== dto.expected_version)
        throw new ConflictException(
          'L’élément a été modifié. Rechargez le dossier.',
        );
      if (
        original.status !== BillableItemStatus.INVOICED ||
        !original.invoice_line_id
      ) {
        throw new ConflictException(
          'Un ajustement après émission exige un élément déjà facturé',
        );
      }
      const originalLine = await manager.getRepository(InvoiceLine).findOne({
        where: { id: original.invoice_line_id, tenant_id: tenantId },
      });
      if (!originalLine)
        throw new ConflictException('La facture d’origine est introuvable');
      const net = this.round(Number(dto.amount_delta));
      const taxRate = Number(dto.tax_rate ?? original.tax_rate ?? 0);
      const tax = this.round((net * taxRate) / 100);
      const adjustment = await repository.save(
        repository.create({
          tenant_id: tenantId,
          dossier_id: original.dossier_id,
          client_id: original.client_id,
          source_type: BillableSourceType.ADJUSTMENT,
          source_id: original.id,
          source_event_key: sourceEventKey,
          occurred_at: new Date(),
          label: `Ajustement — ${original.label}`,
          quantity: 1,
          unit_price: net,
          net_amount: net,
          tax_rate: taxRate,
          tax_amount: tax,
          gross_amount: this.round(net + tax),
          currency: original.currency,
          status: BillableItemStatus.TO_INVOICE,
          calculation_snapshot: {
            originalBillableItemId: original.id,
            originalInvoiceId: originalLine.facture_id,
            reason: dto.reason.trim(),
            actorUserId,
          },
          review_reason: null,
          reserved_at: null,
          invoice_line_id: null,
        }),
      );
      await this.eventService.append(manager, {
        dossierId: original.dossier_id,
        eventType: 'BILLABLE_ITEM_ADJUSTMENT_CREATED',
        aggregateType: 'BillableItem',
        aggregateId: adjustment.id,
        actorUserId,
        payload: {
          originalItemId: original.id,
          originalInvoiceId: originalLine.facture_id,
          amountDelta: net,
          reason: dto.reason,
        },
        idempotencyKey: `EVENT:${sourceEventKey}`,
      });
      return adjustment;
    });
  }

  private async mutateOpenItem(
    itemId: string,
    expectedVersion: number,
    idempotencyKey: string,
    eventType: string,
    actorUserId: number,
    mutate: (item: BillableItem) => void,
  ): Promise<BillableItem> {
    const tenantId = getCurrentTenantId();
    const eventKey = `${eventType}:${idempotencyKey}`;
    const previous = await this.eventRepository.findOne({
      where: { tenant_id: tenantId, idempotency_key: eventKey },
    });
    if (previous?.aggregate_id === itemId) {
      const item = await this.itemRepository.findOne({
        where: { id: itemId, tenant_id: tenantId },
      });
      if (item) return item;
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BillableItem);
      const item = await repository
        .createQueryBuilder('item')
        .setLock('pessimistic_write')
        .where('item.id = :itemId AND item.tenant_id = :tenantId', {
          itemId,
          tenantId,
        })
        .getOne();
      if (!item) throw new NotFoundException('Élément facturable introuvable');
      if (item.lock_version !== expectedVersion)
        throw new ConflictException(
          'L’élément a été modifié. Rechargez le dossier.',
        );
      if (
        ![
          BillableItemStatus.NEEDS_REVIEW,
          BillableItemStatus.TO_INVOICE,
        ].includes(item.status)
      ) {
        throw new ConflictException(
          'Seul un élément non réservé et non facturé peut être abandonné',
        );
      }
      mutate(item);
      const saved = await repository.save(item);
      await this.eventService.append(manager, {
        dossierId: item.dossier_id,
        eventType,
        aggregateType: 'BillableItem',
        aggregateId: item.id,
        actorUserId,
        payload: { status: saved.status, snapshot: saved.calculation_snapshot },
        idempotencyKey: eventKey,
      });
      return saved;
    });
  }

  async listItems(
    dossierId: number,
    filters: { from?: string; to?: string; status?: BillableItemStatus },
  ): Promise<BillableItem[]> {
    const tenantId = getCurrentTenantId();
    const query = this.itemRepository
      .createQueryBuilder('item')
      .where('item.tenant_id = :tenantId', { tenantId })
      .andWhere('item.dossier_id = :dossierId', { dossierId })
      .orderBy('item.occurred_at', 'DESC');
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime()))
        throw new BadRequestException('Date de début invalide');
      query.andWhere('item.occurred_at >= :from', { from });
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (Number.isNaN(to.getTime()))
        throw new BadRequestException('Date de fin invalide');
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) to.setHours(23, 59, 59, 999);
      query.andWhere('item.occurred_at <= :to', { to });
    }
    if (filters.status)
      query.andWhere('item.status = :status', { status: filters.status });
    return query.getMany();
  }

  async searchItems(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: BillableItemStatus;
    source_type?: BillableSourceType;
    dossier_id?: number;
    client_id?: number;
    from?: string;
    to?: string;
    sort_by?: string;
    sort_direction?: string;
  }) {
    const tenantId = getCurrentTenantId();
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 10));
    const query = this.itemRepository
      .createQueryBuilder('item')
      .innerJoin(
        Dossier,
        'dossier',
        'dossier.id = item.dossier_id AND dossier.tenant_id = item.tenant_id',
      )
      .leftJoin(
        Customer,
        'customer',
        'customer.id = item.client_id AND customer.tenant_id = item.tenant_id',
      )
      .leftJoin(
        DossierAction,
        'action',
        "item.source_type = 'ACTION' AND action.id = item.source_id AND action.tenant_id = item.tenant_id",
      )
      .leftJoin(
        InvoiceLine,
        'invoice_line',
        'invoice_line.id = item.invoice_line_id AND invoice_line.tenant_id = item.tenant_id',
      )
      .leftJoin(
        Facture,
        'invoice',
        'invoice.id = invoice_line.facture_id AND invoice.tenant_id = item.tenant_id',
      )
      .where('item.tenant_id = :tenantId', { tenantId })
      .select('item')
      .addSelect('dossier.dossier_number', 'dossier_number')
      .addSelect('dossier.object', 'dossier_object')
      .addSelect('customer.first_name', 'client_first_name')
      .addSelect('customer.last_name', 'client_last_name')
      .addSelect('customer.company_name', 'client_company_name')
      .addSelect('action.title', 'action_title')
      .addSelect('action.status', 'action_status')
      .addSelect('invoice.id', 'invoice_id')
      .addSelect('invoice.numero', 'invoice_number');

    if (filters.search?.trim()) {
      query.andWhere(
        `LOWER(CONCAT_WS(' ', item.label, dossier.dossier_number, dossier.object,
          customer.first_name, customer.last_name, customer.company_name,
          action.title, invoice.numero)) LIKE :search`,
        { search: `%${filters.search.trim().toLowerCase()}%` },
      );
    }
    if (filters.status) {
      query.andWhere('item.status = :status', { status: filters.status });
    }
    if (filters.source_type) {
      query.andWhere('item.source_type = :sourceType', {
        sourceType: filters.source_type,
      });
    }
    if (Number(filters.dossier_id) > 0) {
      query.andWhere('item.dossier_id = :dossierId', {
        dossierId: Number(filters.dossier_id),
      });
    }
    if (Number(filters.client_id) > 0) {
      query.andWhere('item.client_id = :clientId', {
        clientId: Number(filters.client_id),
      });
    }
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime()))
        throw new BadRequestException('Date de début invalide');
      query.andWhere('item.occurred_at >= :from', { from });
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (Number.isNaN(to.getTime()))
        throw new BadRequestException('Date de fin invalide');
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to))
        to.setHours(23, 59, 59, 999);
      query.andWhere('item.occurred_at <= :to', { to });
    }

    const sortColumns: Record<string, string> = {
      occurred_at: 'item.occurred_at',
      label: 'item.label',
      gross_amount: 'item.gross_amount',
      status: 'item.status',
      source_type: 'item.source_type',
      dossier_number: 'dossier.dossier_number',
      client_name: 'customer.last_name',
      invoice_number: 'invoice.numero',
    };
    const sortColumn = sortColumns[filters.sort_by ?? 'occurred_at'] ?? 'item.occurred_at';
    const sortDirection = filters.sort_direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const total = await query.getCount();
    // Avec des jointures, TypeORM enveloppe getRawAndEntities + skip/take dans
    // un SELECT DISTINCT dont les alias ne correspondent plus aux colonnes
    // jointes. Paginer les identifiants Ã©vite cette requÃªte distinctAlias.
    const idRows = await query
      .clone()
      .select('item.id', 'item_id')
      .addSelect(sortColumn, 'sort_value')
      .orderBy(sortColumn, sortDirection)
      .addOrderBy('item.id', sortDirection)
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ item_id: string }>();
    const pageIds = idRows.map((row) => row.item_id);
    const { entities, raw } = pageIds.length
      ? await query
          .andWhere('item.id IN (:...pageIds)', { pageIds })
          .getRawAndEntities()
      : { entities: [], raw: [] };
    const pageOrder = new Map(pageIds.map((id, index) => [id, index]));

    const data = entities.map((item, index) => {
      const row = raw[index] as Record<string, unknown>;
      const companyName = String(row.client_company_name ?? '').trim();
      const personalName = [row.client_first_name, row.client_last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      return Object.assign(item, {
        dossier_number: row.dossier_number,
        dossier_object: row.dossier_object,
        client_name: companyName || personalName || 'Client non renseigné',
        action_title: row.action_title ?? null,
        action_status: row.action_status ?? null,
        invoice_id: row.invoice_id ?? null,
        invoice_number: row.invoice_number ?? null,
      });
    }).sort(
      (left, right) =>
        (pageOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (pageOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_previous: page > 1,
        has_next: page < totalPages,
      },
    };
  }

  async getFilterOptions() {
    const tenantId = getCurrentTenantId();
    const rows = await this.itemRepository
      .createQueryBuilder('item')
      .innerJoin(
        Dossier,
        'dossier',
        'dossier.id = item.dossier_id AND dossier.tenant_id = item.tenant_id',
      )
      .leftJoin(
        Customer,
        'customer',
        'customer.id = item.client_id AND customer.tenant_id = item.tenant_id',
      )
      .where('item.tenant_id = :tenantId', { tenantId })
      .select('item.dossier_id', 'dossier_id')
      .addSelect('dossier.dossier_number', 'dossier_number')
      .addSelect('dossier.object', 'dossier_object')
      .addSelect('item.client_id', 'client_id')
      .addSelect('customer.first_name', 'client_first_name')
      .addSelect('customer.last_name', 'client_last_name')
      .addSelect('customer.company_name', 'client_company_name')
      .distinct(true)
      .getRawMany<{
        dossier_id: number | string;
        dossier_number: string | null;
        dossier_object: string | null;
        client_id: number | string | null;
        client_first_name: string | null;
        client_last_name: string | null;
        client_company_name: string | null;
      }>();

    const dossiers = new Map<
      string,
      { value: string; label: string; subtitle?: string }
    >();
    const clients = new Map<
      string,
      { value: string; label: string }
    >();

    rows.forEach((row) => {
      const dossierId = String(row.dossier_id);
      if (!dossiers.has(dossierId)) {
        dossiers.set(dossierId, {
          value: dossierId,
          label: row.dossier_number || `Dossier #${dossierId}`,
          ...(row.dossier_object ? { subtitle: row.dossier_object } : {}),
        });
      }

      if (row.client_id == null) return;
      const clientId = String(row.client_id);
      if (clients.has(clientId)) return;
      const companyName = String(row.client_company_name ?? '').trim();
      const personalName = [row.client_first_name, row.client_last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      clients.set(clientId, {
        value: clientId,
        label: companyName || personalName || `Client #${clientId}`,
      });
    });

    return {
      dossiers: [...dossiers.values()].sort((left, right) =>
        left.label.localeCompare(right.label, 'fr', { numeric: true }),
      ),
      clients: [...clients.values()].sort((left, right) =>
        left.label.localeCompare(right.label, 'fr'),
      ),
    };
  }

  async getItemsSummary() {
    const tenantId = getCurrentTenantId();
    const rows = await this.itemRepository
      .createQueryBuilder('item')
      .select('item.status', 'status')
      .addSelect('COUNT(item.id)', 'count')
      .addSelect('COALESCE(SUM(item.gross_amount), 0)', 'amount')
      .where('item.tenant_id = :tenantId', { tenantId })
      .groupBy('item.status')
      .getRawMany<{ status: BillableItemStatus; count: string; amount: string }>();
    const byStatus = Object.values(BillableItemStatus).reduce(
      (summary, status) => {
        summary[status] = { count: 0, amount: 0 };
        return summary;
      },
      {} as Record<BillableItemStatus, { count: number; amount: number }>,
    );
    rows.forEach((row) => {
      byStatus[row.status] = {
        count: Number(row.count),
        amount: Number(row.amount),
      };
    });
    return { by_status: byStatus };
  }

  async reviewItem(
    itemId: string,
    dto: ReviewBillableItemDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<BillableItem> {
    const tenantId = getCurrentTenantId();
    const eventKey = `BILLABLE_ITEM_REVIEWED:${idempotencyKey}`;
    const priorEvent = await this.eventRepository.findOne({
      where: { tenant_id: tenantId, idempotency_key: eventKey },
    });
    if (priorEvent?.aggregate_id === itemId) {
      const priorItem = await this.itemRepository.findOne({
        where: { id: itemId, tenant_id: tenantId },
      });
      if (priorItem) return priorItem;
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BillableItem);
      const item = await repository
        .createQueryBuilder('item')
        .setLock('pessimistic_write')
        .where('item.id = :itemId', { itemId })
        .andWhere('item.tenant_id = :tenantId', { tenantId })
        .getOne();
      if (!item) throw new NotFoundException('Élément facturable introuvable');

      if (item.status !== BillableItemStatus.NEEDS_REVIEW) {
        const sameEvent = await manager
          .getRepository(CaseWorkflowEvent)
          .findOne({
            where: { tenant_id: tenantId, idempotency_key: eventKey },
          });
        if (sameEvent?.aggregate_id === item.id) return item;
        throw new ConflictException(
          'Cet élément a déjà été traité ou n’est plus à revoir',
        );
      }
      if (dto.expected_version !== item.lock_version) {
        throw new ConflictException(
          'Cet élément facturable a été modifié. Rechargez le dossier.',
        );
      }

      const previousReason = item.review_reason;
      const quantity = Number(dto.quantity ?? item.quantity ?? 1);
      const unitPrice = Number(dto.unit_price);
      const taxRate = Number(dto.tax_rate ?? item.tax_rate ?? 0);
      const net = this.round(quantity * unitPrice);
      const tax = this.round((net * taxRate) / 100);

      item.quantity = quantity;
      item.unit_price = unitPrice;
      item.net_amount = net;
      item.tax_rate = taxRate;
      item.tax_amount = tax;
      item.gross_amount = this.round(net + tax);
      item.currency = item.currency || 'XAF';
      item.status = BillableItemStatus.TO_INVOICE;
      item.review_reason = null;
      item.calculation_snapshot = {
        ...(item.calculation_snapshot ?? {}),
        reviewResolution: {
          previousReason,
          quantity,
          unitPrice,
          taxRate,
          note: dto.note ?? null,
          actorUserId,
          reviewedAt: new Date().toISOString(),
        },
      };
      const saved = await repository.save(item);

      await this.eventService.append(manager, {
        dossierId: item.dossier_id,
        eventType: 'BILLABLE_ITEM_REVIEWED',
        aggregateType: 'BillableItem',
        aggregateId: item.id,
        actorUserId,
        payload: {
          previousReason,
          quantity,
          unitPrice,
          taxRate,
          netAmount: saved.net_amount,
          taxAmount: saved.tax_amount,
          grossAmount: saved.gross_amount,
          note: dto.note ?? null,
        },
        idempotencyKey: eventKey,
      });
      return saved;
    });
  }

  async invoiceFromItems(
    dto: GenerateInvoiceFromItemsDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<Facture> {
    const tenantId = getCurrentTenantId();
    const priorEvent = await this.eventRepository.findOne({
      where: {
        tenant_id: tenantId,
        idempotency_key: `INVOICE:${idempotencyKey}`,
      },
    });
    const priorInvoiceId = priorEvent?.payload?.invoiceId;
    if (typeof priorInvoiceId === 'string') {
      const prior = await this.factureRepository.findOne({
        where: { id: priorInvoiceId, tenant_id: tenantId },
        relations: ['lines'],
      });
      if (prior) return prior;
    }

    return this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(BillableItem);
      const items = await itemRepo
        .createQueryBuilder('item')
        .setLock('pessimistic_write')
        .where('item.tenant_id = :tenantId', { tenantId })
        .andWhere('item.id IN (:...ids)', { ids: dto.billable_item_ids })
        .getMany();
      if (items.length !== dto.billable_item_ids.length) {
        throw new NotFoundException(
          'Un ou plusieurs éléments à facturer sont introuvables',
        );
      }
      if (items.some((item) => item.status !== BillableItemStatus.TO_INVOICE)) {
        const sameRequest = await manager
          .getRepository(CaseWorkflowEvent)
          .findOne({
            where: {
              tenant_id: tenantId,
              idempotency_key: `INVOICE:${idempotencyKey}`,
            },
          });
        const sameInvoiceId = sameRequest?.payload?.invoiceId;
        if (typeof sameInvoiceId === 'string') {
          const sameInvoice = await manager.getRepository(Facture).findOne({
            where: { id: sameInvoiceId, tenant_id: tenantId },
            relations: ['lines'],
          });
          if (sameInvoice) return sameInvoice;
        }
        throw new ConflictException(
          'Un élément est déjà réservé, facturé ou doit être revu',
        );
      }
      if (new Set(items.map((item) => item.dossier_id)).size !== 1) {
        throw new ConflictException(
          'La V1 génère une facture pour un seul dossier',
        );
      }
      if (new Set(items.map((item) => item.currency)).size !== 1) {
        throw new ConflictException(
          'Les éléments sélectionnés doivent utiliser la même devise',
        );
      }
      const dossier = await manager.getRepository(Dossier).findOne({
        where: { id: items[0].dossier_id, tenant_id: tenantId },
        relations: ['client'],
      });
      if (!dossier) throw new NotFoundException('Dossier introuvable');

      const reservedAt = new Date();
      items.forEach((item) => {
        item.status = BillableItemStatus.RESERVED;
        item.reserved_at = reservedAt;
      });
      await itemRepo.save(items);

      const net = this.round(
        items.reduce((sum, item) => sum + Number(item.net_amount), 0),
      );
      const tax = this.round(
        items.reduce((sum, item) => sum + Number(item.tax_amount), 0),
      );
      const adjustmentItems = items.filter(
        (item) => item.source_type === BillableSourceType.ADJUSTMENT,
      );
      const originalInvoiceIds = new Set(
        adjustmentItems
          .map((item) => item.calculation_snapshot?.originalInvoiceId)
          .filter((id): id is string => typeof id === 'string'),
      );
      if (adjustmentItems.length && adjustmentItems.length !== items.length) {
        throw new ConflictException(
          'Les ajustements doivent être facturés séparément des prestations normales',
        );
      }
      if (adjustmentItems.length && originalInvoiceIds.size !== 1) {
        throw new ConflictException(
          'Les ajustements d’un avoir doivent concerner une seule facture d’origine',
        );
      }
      const invoiceDate = dto.invoice_date
        ? new Date(dto.invoice_date)
        : new Date();
      const dueDate = dto.due_date
        ? new Date(dto.due_date)
        : new Date(invoiceDate.getTime() + 30 * 86_400_000);
      const isCreditNote = adjustmentItems.length > 0 && net < 0;
      const facture = await this.factureService.createFacture(
        {
          dossierId: dossier.id,
          clientId: dossier.client_id,
          type: isCreditNote ? TypeFacture.AVOIR : TypeFacture.HONORAIRES,
          original_facture_id: isCreditNote
            ? [...originalInvoiceIds][0]
            : undefined,
          dateFacture: invoiceDate,
          dateEcheance: dueDate,
          montantHT: net,
          tauxTVA: net !== 0 ? this.round((tax / net) * 100) : 0,
          montantTVA: tax,
          montantTTC: this.round(net + tax),
          description: isCreditNote
            ? `Avoir lié à la facture d’origine — dossier ${dossier.dossier_number}`
            : `Prestations du dossier ${dossier.dossier_number}`,
          statut: StatutFacture.BROUILLON,
          notesInternes: `Générée depuis ${items.length} élément(s) facturable(s)`,
        },
        { manager, dossier, client: dossier.client },
      );

      const lineRepo = manager.getRepository(InvoiceLine);
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const line = await lineRepo.save(
          lineRepo.create({
            tenant_id: tenantId,
            facture_id: facture.id,
            dossier_id: item.dossier_id,
            billable_item_id: item.id,
            display_order: index + 1,
            label: item.label,
            quantity: item.quantity,
            unit_price: item.unit_price,
            net_amount: item.net_amount,
            tax_rate: item.tax_rate,
            tax_amount: item.tax_amount,
            gross_amount: item.gross_amount,
            currency: item.currency,
            source_snapshot: {
              sourceType: item.source_type,
              sourceId: item.source_id,
              sourceEventKey: item.source_event_key,
              calculation: item.calculation_snapshot,
            },
          }),
        );
        item.status = BillableItemStatus.INVOICED;
        item.invoice_line_id = line.id;
      }
      await itemRepo.save(items);
      await this.eventService.append(manager, {
        dossierId: dossier.id,
        eventType: 'INVOICE_CREATED_FROM_BILLABLE_ITEMS',
        aggregateType: 'Facture',
        aggregateId: facture.id,
        actorUserId,
        payload: {
          invoiceId: facture.id,
          billableItemIds: items.map((item) => item.id),
        },
        idempotencyKey: `INVOICE:${idempotencyKey}`,
      });
      return Object.assign(facture, {
        lines: await lineRepo.find({ where: { facture_id: facture.id } }),
      });
    });
  }
}
