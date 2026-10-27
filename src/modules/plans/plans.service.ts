import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { InjectRepository } from '@nestjs/typeorm';

import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Plan } from './entities/plan.entity';
import { PlanQuotaService } from './plan-quota.service';
import { AiCreditsService } from './ai-credits/ai-credits.service';
import { withoutCreditAllowance } from './ai-credits/ai-credits';

@Injectable()
export class PlansService extends BaseServiceV1<Plan> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Plan)
    protected repository: Repository<Plan>,
    @InjectRepository(Cabinet)
    private cabinetRepo: Repository<Cabinet>,
    private readonly quotaService: PlanQuotaService,
    private readonly aiCredits: AiCreditsService,
    @Optional() private readonly appEvents?: EventEmitter2,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    // Code facultatif : généré automatiquement s'il n'est pas fourni.
    if (!dto.code?.trim()) {
      dto.code = generateEntityCode('PLAN', dto.name);
    }
    const plan = this.repository.create(dto);
    return this.repository.save(plan);
  }

  async findAll(): Promise<Plan[]> {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  /** Plans proposés aux cabinets : sans le nombre de crédits IA du forfait. */
  async findActive(): Promise<Plan[]> {
    const plans = await this.repository.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
    return plans.map((plan) => withoutCreditAllowance(plan));
  }

  async findByCode(code: string): Promise<Plan | null> {
    return this.repository.findOne({ where: { code } });
  }

  async findOne(id: number): Promise<Plan> {
    const plan = await this.repository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan #${id} non trouvé`);
    return plan;
  }

  async update(id: number, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.repository.save(plan);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.repository.delete(id);
  }

  /**
   * Assigne un plan à un cabinet.
   */
  async assignPlanToCabinet(
    cabinetId: number,
    planId: number,
  ): Promise<Cabinet> {
    const [cabinet, plan] = await Promise.all([
      this.cabinetRepo.findOne({ where: { id: cabinetId } }),
      this.findOne(planId),
    ]);
    if (!cabinet)
      throw new NotFoundException(`Cabinet #${cabinetId} non trouvé`);

    cabinet.plan_id = plan.id;
    cabinet.plan = plan.code as any; // synchro champ legacy
    const saved = await this.cabinetRepo.save(cabinet);
    this.appEvents?.emit('ai.config.changed', { tenantId: cabinetId });
    return saved;
  }

  /**
   * Retourne l'état d'utilisation complet du cabinet courant.
   * Comptages réels via COUNT(*) isolés par tenant.
   */
  async getQuotaStatus(cabinetId: number): Promise<any> {
    // Comptages directs via requêtes SQL tenant-scoped
    const [employees, clients, dossiers, storage, aiStatus] = await Promise.all([
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM employee WHERE tenant_id = ?',
        [cabinetId],
      ),
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM customer WHERE tenant_id = ?',
        [cabinetId],
      ),
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM dossiers WHERE tenant_id = ?',
        [cabinetId],
      ),
      this.cabinetRepo.manager.query(
        'SELECT COALESCE(SUM(file_size), 0) as total FROM document_customer WHERE tenant_id = ?',
        [cabinetId],
      ),
      // Crédits IA du mois : pourcentages seulement (jamais de crédits ni de montants).
      this.aiCredits.status(cabinetId),
    ]);

    const counts = {
      employees: Number(employees[0]?.cnt ?? 0),
      clients: Number(clients[0]?.cnt ?? 0),
      dossiers: Number(dossiers[0]?.cnt ?? 0),
      storageBytes: Number(storage[0]?.total ?? 0),
    };

    const usage = await this.quotaService.getUsageStatus(cabinetId, counts, aiStatus);
    // Le cabinet ne voit que des pourcentages : jamais le nombre de crédits du forfait.
    return { ...usage, plan: withoutCreditAllowance(usage.plan) };
  }
}
