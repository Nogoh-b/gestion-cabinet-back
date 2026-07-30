import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { ResourceActor } from 'src/core/resource-policy.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  CreateLegalDeadlineRuleDto,
  UpdateLegalDeadlineRuleDto,
} from './dto/legal-deadline.dto';
import {
  LegalDeadlineRule,
  LegalDeadlineRuleStatus,
} from './entities/legal-deadline-rule.entity';

@Injectable()
export class LegalDeadlineRuleService {
  constructor(
    @InjectRepository(LegalDeadlineRule)
    private readonly repository: Repository<LegalDeadlineRule>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  findAll(): Promise<LegalDeadlineRule[]> {
    return this.repository.find({
      order: { familyKey: 'ASC', version: 'DESC' },
    });
  }

  async findOne(id: number): Promise<LegalDeadlineRule> {
    const rule = await this.repository.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`Règle de délai ${id} introuvable`);
    return rule;
  }

  async create(
    dto: CreateLegalDeadlineRuleDto,
    actor: ResourceActor,
  ): Promise<LegalDeadlineRule> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const familyKey = dto.family_key?.trim() || randomUUID();
      const rows = await manager.query(
        `SELECT COALESCE(MAX(version), 0) AS maxVersion
         FROM legal_deadline_rules
         WHERE tenant_id = ? AND family_key = ?
         FOR UPDATE`,
        [tenantId, familyKey],
      );
      const repository = manager.getRepository(LegalDeadlineRule);
      const rule = repository.create({
        tenant_id: tenantId,
        familyKey,
        version: Number(rows[0]?.maxVersion ?? 0) + 1,
        status: LegalDeadlineRuleStatus.DRAFT,
        ...this.mutableValues(dto),
        activatedAt: null,
        retiredAt: null,
      });
      this.assertRule(rule);
      const saved = await repository.save(rule);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: 'legal_deadline_rule.created',
        resourceType: 'LegalDeadlineRule',
        resourceId: saved.id,
        afterState: this.auditState(saved),
      });
      return saved;
    });
  }

  async update(
    id: number,
    dto: UpdateLegalDeadlineRuleDto,
    actor: ResourceActor,
  ): Promise<LegalDeadlineRule> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const rule = await manager.findOne(LegalDeadlineRule, {
        where: { id, tenant_id: getCurrentTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rule) throw new NotFoundException(`Règle de délai ${id} introuvable`);
      if (rule.status !== LegalDeadlineRuleStatus.DRAFT) {
        throw new BadRequestException(
          'Une règle active ou retirée est immuable ; créez une nouvelle version',
        );
      }
      const before = this.auditState(rule);
      Object.assign(rule, this.mutableValues(dto, rule));
      this.assertRule(rule);
      const saved = await manager.save(rule);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: 'legal_deadline_rule.updated',
        resourceType: 'LegalDeadlineRule',
        resourceId: saved.id,
        beforeState: before,
        afterState: this.auditState(saved),
      });
      return saved;
    });
  }

  async activate(id: number, actor: ResourceActor): Promise<LegalDeadlineRule> {
    return this.changeStatus(
      id,
      LegalDeadlineRuleStatus.DRAFT,
      LegalDeadlineRuleStatus.ACTIVE,
      actor,
    );
  }

  async retire(id: number, actor: ResourceActor): Promise<LegalDeadlineRule> {
    return this.changeStatus(
      id,
      LegalDeadlineRuleStatus.ACTIVE,
      LegalDeadlineRuleStatus.RETIRED,
      actor,
    );
  }

  private async changeStatus(
    id: number,
    expected: LegalDeadlineRuleStatus,
    target: LegalDeadlineRuleStatus,
    actor: ResourceActor,
  ): Promise<LegalDeadlineRule> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const rule = await manager.findOne(LegalDeadlineRule, {
        where: { id, tenant_id: getCurrentTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rule) throw new NotFoundException(`Règle de délai ${id} introuvable`);
      if (rule.status !== expected) {
        throw new BadRequestException(
          `La règle doit être ${expected} avant le passage à ${target}`,
        );
      }
      this.assertRule(rule);
      const before = this.auditState(rule);
      rule.status = target;
      if (target === LegalDeadlineRuleStatus.ACTIVE) {
        rule.activatedAt = new Date();
      } else {
        rule.retiredAt = new Date();
      }
      const saved = await manager.save(rule);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action:
          target === LegalDeadlineRuleStatus.ACTIVE
            ? 'legal_deadline_rule.activated'
            : 'legal_deadline_rule.retired',
        resourceType: 'LegalDeadlineRule',
        resourceId: saved.id,
        beforeState: before,
        afterState: this.auditState(saved),
      });
      return saved;
    });
  }

  private mutableValues(
    dto: Partial<CreateLegalDeadlineRuleDto>,
    current?: LegalDeadlineRule,
  ): Partial<LegalDeadlineRule> {
    return {
      name: dto.name ?? current?.name,
      jurisdictionId:
        dto.jurisdiction_id !== undefined
          ? dto.jurisdiction_id
          : current?.jurisdictionId ?? null,
      procedureTypeId:
        dto.procedure_type_id !== undefined
          ? dto.procedure_type_id
          : current?.procedureTypeId ?? null,
      decisionOutcome:
        dto.decision_outcome !== undefined
          ? dto.decision_outcome.trim() || null
          : current?.decisionOutcome ?? null,
      notificationMethod:
        dto.notification_method ?? current?.notificationMethod,
      durationValue: dto.duration_value ?? current?.durationValue,
      durationUnit: dto.duration_unit ?? current?.durationUnit,
      includeStartDay: dto.include_start_day ?? current?.includeStartDay ?? false,
      expiryEvent:
        dto.expiry_event !== undefined
          ? dto.expiry_event.trim() || null
          : current?.expiryEvent ?? null,
      warningOffsets: [
        ...new Set(dto.warning_offsets ?? current?.warningOffsets ?? [7, 3, 1, 0]),
      ].sort((a, b) => b - a),
      priority: dto.priority ?? current?.priority ?? 0,
      effectiveFrom:
        dto.effective_from !== undefined
          ? new Date(dto.effective_from)
          : current?.effectiveFrom ?? null,
      effectiveTo:
        dto.effective_to !== undefined
          ? new Date(dto.effective_to)
          : current?.effectiveTo ?? null,
    };
  }

  private assertRule(rule: Partial<LegalDeadlineRule>): void {
    if (!rule.name?.trim() || !rule.notificationMethod || !rule.durationUnit) {
      throw new BadRequestException('La règle de délai est incomplète');
    }
    if (!Number.isInteger(rule.durationValue) || Number(rule.durationValue) < 1) {
      throw new BadRequestException('La durée doit être un entier strictement positif');
    }
    if (
      rule.effectiveFrom &&
      rule.effectiveTo &&
      rule.effectiveTo <= rule.effectiveFrom
    ) {
      throw new BadRequestException(
        'La fin de validité doit être postérieure au début',
      );
    }
  }

  private auditState(rule: LegalDeadlineRule): Record<string, any> {
    return {
      familyKey: rule.familyKey,
      version: rule.version,
      status: rule.status,
      jurisdictionId: rule.jurisdictionId,
      procedureTypeId: rule.procedureTypeId,
      decisionOutcome: rule.decisionOutcome,
      notificationMethod: rule.notificationMethod,
      durationValue: rule.durationValue,
      durationUnit: rule.durationUnit,
      expiryEvent: rule.expiryEvent,
    };
  }
}
