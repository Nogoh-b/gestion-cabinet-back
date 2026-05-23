import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cabinet, CabinetPlan, CabinetStatus } from './entities/cabinet.entity';

@Injectable()
export class CabinetService implements OnModuleInit {
  private readonly logger = new Logger(CabinetService.name);

  constructor(
    @InjectRepository(Cabinet)
    private readonly repo: Repository<Cabinet>,
  ) {}

  /**
   * Au démarrage : crée le cabinet par défaut (tenant_id = 1) s'il n'existe pas.
   * Toutes les données existantes ont déjà tenant_id = 1 grâce au default TypeORM.
   */
  async onModuleInit() {
    const exists = await this.repo.findOne({ where: { id: 1 } });
    if (!exists) {
      const cabinet = this.repo.create({
        id:   1,
        code: this.generateCode(),
        name: process.env.DEFAULT_CABINET_NAME ?? 'Cabinet Principal',
        status: 'active',
        plan:   'pro',
        routing_mode: 'path',
      });
      await this.repo.save(cabinet);
      this.logger.log(`✅ Cabinet par défaut créé — code: "${cabinet.code}"`);
    } else {
      this.logger.log(`✅ Cabinet par défaut existant — id=1 code="${exists.code}"`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(data: { name: string; plan?: CabinetPlan }): Promise<Cabinet> {
    const cabinet = this.repo.create({
      code:   this.generateCode(),
      name:   data.name,
      status: 'trial',
      plan:   data.plan ?? 'starter',
      routing_mode: 'path',
      trial_ends_at: this.trialEnd(30),
    });
    return this.repo.save(cabinet);
  }

  async findAll(): Promise<Cabinet[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findById(id: number): Promise<Cabinet> {
    const cabinet = await this.repo.findOne({ where: { id } });
    if (!cabinet) throw new NotFoundException(`Cabinet #${id} introuvable`);
    return cabinet;
  }

  async findByCode(code: string): Promise<Cabinet | null> {
    return this.repo.findOne({ where: { code } });
  }

  async update(id: number, data: Partial<Pick<Cabinet, 'name' | 'status' | 'plan' | 'routing_mode'>>): Promise<Cabinet> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async suspend(id: number): Promise<Cabinet> {
    return this.update(id, { status: 'suspended' });
  }

  async activate(id: number): Promise<Cabinet> {
    return this.update(id, { status: 'active' });
  }

  // ── Utilitaires ───────────────────────────────────────────────────

  /** Génère un code court DNS-safe de 8 caractères (ex: "xk7m2p8a") */
  generateCode(length = 8): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code: string;
    do {
      code = Array.from(
        { length },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join('');
    } while (/^\d/.test(code)); // évite de commencer par un chiffre (DNS)
    return code;
  }

  /** Retourne l'URL d'accès selon le mode de routing configuré */
  getCabinetUrl(cabinet: Cabinet): string {
    const base = process.env.BASE_DOMAIN ?? 'localhost:3000';
    if (cabinet.routing_mode === 'subdomain') {
      return `https://${cabinet.code}.${base}`;
    }
    return `https://${base}/t/${cabinet.code}`;
  }

  private trialEnd(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }
}
