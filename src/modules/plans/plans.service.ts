import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Plan } from './entities/plan.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { PlanQuotaService } from './plan-quota.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

@Injectable()
export class PlansService extends BaseServiceV1<Plan> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Plan)
    protected repository: Repository<Plan>,
    @InjectRepository(Cabinet)
    private cabinetRepo: Repository<Cabinet>,
    private readonly quotaService: PlanQuotaService,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.repository.create(dto);
    return this.repository.save(plan);
  }

  async findAll(): Promise<Plan[]> {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  async findActive(): Promise<Plan[]> {
    return this.repository.find({ where: { is_active: true }, order: { name: 'ASC' } });
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
  async assignPlanToCabinet(cabinetId: number, planId: number): Promise<Cabinet> {
    const [cabinet, plan] = await Promise.all([
      this.cabinetRepo.findOne({ where: { id: cabinetId } }),
      this.findOne(planId),
    ]);
    if (!cabinet) throw new NotFoundException(`Cabinet #${cabinetId} non trouvé`);

    cabinet.plan_id = plan.id;
    cabinet.plan   = plan.code as any; // synchro champ legacy
    return this.cabinetRepo.save(cabinet);
  }

  /**
   * Retourne l'état d'utilisation complet du cabinet courant.
   * Comptages réels via COUNT(*) isolés par tenant.
   */
  async getQuotaStatus(cabinetId: number): Promise<any> {
    // Comptages directs via requêtes SQL tenant-scoped
    const [employees, clients, dossiers] = await Promise.all([
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM employee WHERE tenant_id = ?',
        [cabinetId],
      ),
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM customer WHERE tenant_id = ?',
        [cabinetId],
      ),
      this.cabinetRepo.manager.query(
        'SELECT COUNT(*) as cnt FROM dossier WHERE tenant_id = ?',
        [cabinetId],
      ),
    ]);

    const counts = {
      employees: Number(employees[0]?.cnt ?? 0),
      clients:   Number(clients[0]?.cnt ?? 0),
      dossiers:  Number(dossiers[0]?.cnt ?? 0),
    };

    return this.quotaService.getUsageStatus(cabinetId, counts);
  }
}
