import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  Cabinet,
  CabinetPlan,
  cabinetLogoToDataUri,
  serializeCabinet,
} from './entities/cabinet.entity';
import { Plan } from '../plans/entities/plan.entity';
import { applyLogoInput, logoFileToUrl, writeLogoFile } from './cabinet-logo.util';
import { CreateCabinetDto } from './dto/create-cabinet.dto';

@Injectable()
export class CabinetService implements OnModuleInit {
  private readonly logger = new Logger(CabinetService.name);

  constructor(
    @InjectRepository(Cabinet)
    private readonly repo: Repository<Cabinet>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  /**
   * Au démarrage : crée le cabinet par défaut (tenant_id = 1) s'il n'existe pas.
   * Toutes les données existantes ont déjà tenant_id = 1 grâce au default TypeORM.
   */
  async onModuleInit() {
    // Génère les fichiers logo manquants pour les cabinets dont le logo n'existe
    // qu'en blob (anciens enregistrements) → permet d'exposer une URL hébergée
    // sans re-upload manuel.
    await this.backfillLogoFiles().catch((e) =>
      this.logger.warn(`Backfill logos échoué : ${e.message}`),
    );

    // Backfill plan_id pour les cabinets existants ayant un plan (legacy)
    // mais pas de plan_id (FK vers la table plans)
    await this.backfillPlanIds().catch((e) =>
      this.logger.warn(`Backfill plan_id échoué : ${e.message}`),
    );
    // const exists = await this.repo.findOne({ where: { id: 1 } });
    // if (!exists) {
    //   const cabinet = this.repo.create({
    //     id:   1,
    //     code: this.generateCode(),
    //     name: process.env.DEFAULT_CABINET_NAME ?? 'Cabinet Principal',
    //     status: 'active',
    //     plan:   'pro',
    //     routing_mode: 'path',
    //   });
    //   await this.repo.save(cabinet);
    //   this.logger.log(`✅ Cabinet par défaut créé — code: "${cabinet.code}"`);
    // } else {
    //   this.logger.log(`✅ Cabinet par défaut existant — id=1 code="${exists.code}"`);
    // }
  }

  /**
   * Pour chaque cabinet possédant un logo en blob mais sans fichier statique
   * (`logo_file` vide), écrit le fichier sous `uploads/cabinets/` et enregistre
   * son chemin. Idempotent : ne fait rien si le fichier existe déjà.
   */
  private async backfillLogoFiles(): Promise<void> {
    const cabinets = await this.repo.find();
    for (const c of cabinets) {
      if (c.logo_file) continue; // déjà migré
      if (!c.logo || !(c.logo as Buffer).length || !c.logo_mime) continue;
      const relPath = writeLogoFile(c.id, c.logo as Buffer, c.logo_mime);
      await this.repo.update(c.id, { logo_file: relPath });
      this.logger.log(`✅ Logo cabinet #${c.id} exporté en fichier → ${relPath}`);
    }
  }

  /**
   * Pour chaque cabinet ayant un `plan` (legacy code) mais pas de `plan_id`
   * (FK vers l'entité Plan), résout le code et écrit la FK.
   * Idempotent : ne touche pas les cabinets déjà liés.
   */
  private async backfillPlanIds(): Promise<void> {
    const cabinets = await this.repo.find({ where: { plan_id: IsNull() } });
    if (!cabinets.length) return;

    // Charger tous les plans actifs indexés par code
    const plans = await this.planRepo.find({ where: { is_active: true } });
    const planByCode = new Map(plans.map((p) => [p.code, p]));

    let updated = 0;
    for (const c of cabinets) {
      const code = c.plan || 'free';
      const plan = planByCode.get(code);
      if (plan) {
        await this.repo.update(c.id, { plan_id: plan.id });
        updated++;
      } else {
        this.logger.warn(`Cabinet #${c.id} : plan "${code}" non trouvé dans la table plans`);
      }
    }
    if (updated) {
      this.logger.log(`✅ Backfill plan_id : ${updated} cabinet(s) mis à jour`);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  /**
   * Crée un nouveau cabinet (onboarding) avec branding/coordonnées optionnels,
   * puis seed les données de référence (types d'audience, juridictions,
   * templates mail/PDF, etc.) dans le contexte du nouveau tenant.
   */
  async create(data: CreateCabinetDto): Promise<Cabinet> {
    const { logo_url, slogan, brand_color, contact_email, contact_phone,
            address, website, rccm, nina, bank_account, email_footer,
            ...rest } = data;

    // Résoudre le plan_id à partir du code plan (legacy field → FK)
    const planCode = rest.plan ?? 'free';
    let resolvedPlanId: number | null = null;
    try {
      const planEntity = await this.planRepo.findOne({ where: { code: planCode, is_active: true } });
      resolvedPlanId = planEntity?.id ?? null;
      if (!resolvedPlanId) {
        this.logger.warn(`Plan "${planCode}" introuvable — plan_id restera null`);
      }
    } catch (e) {
      this.logger.warn(`Erreur lors de la résolution du plan "${planCode}" : ${e.message}`);
    }

    const cabinet = this.repo.create({
      code:           this.generateCode(),
      name:           rest.name,
      status:         'trial',
      plan:           planCode,
      plan_id:        resolvedPlanId,
      routing_mode:   'path',
      trial_ends_at:  this.trialEnd(30),
      // Branding & coordonnees
      slogan:         slogan ?? null,
      brand_color:    brand_color ?? null,
      contact_email:  contact_email ?? null,
      contact_phone:  contact_phone ?? null,
      address:        address ?? null,
      website:        website ?? null,
      email_footer:   email_footer ?? null,
      // Informations legales
      rccm:           rccm ?? null,
      nina:           nina ?? null,
      bank_account:   bank_account ?? null,
    });

    // Sauver d'abord pour obtenir l'id (nécessaire pour le logo_file)
    const saved = await this.repo.save(cabinet);

    // Appliquer le logo si fourni (a besoin de l'id pour écrire le fichier)
    if (logo_url) {
      applyLogoInput(saved, logo_url);
      await this.repo.save(saved);
    }

    return saved;
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

  /**
   * Résout un code cabinet → branding public (logo, slogan, nom…).
   *
   * La configuration vit désormais directement dans la table `cabinets`
   * (la table `app_settings` a été fusionnée). Plus aucune jointure n'est
   * nécessaire.
   *
   * Utilisé par l'endpoint public GET /cabinets/resolve/:code
   * pour fournir au frontend le branding complet avant authentification.
   */
  async resolveWithSettings(code: string): Promise<{
    id:           number;
    code:         string;
    name:         string;
    status:       string;
    plan:         string;
    routing_mode: string;
    logo:         string | null;
    slogan:       string | null;
  } | null> {
    const cabinet = await this.findByCode(code);
    if (!cabinet) return null;

    return {
      id:           cabinet.id,
      code:         cabinet.code,
      name:         cabinet.name,
      status:       cabinet.status,
      plan:         cabinet.plan,
      routing_mode: cabinet.routing_mode,
      // URL hébergée en priorité (affichable en e-mail), repli data-URI.
      logo:         logoFileToUrl(cabinet.logo_file) ?? cabinetLogoToDataUri(cabinet.logo, cabinet.logo_mime),
      slogan:       cabinet.slogan?.trim() ? cabinet.slogan : null,
    };
  }

  async update(id: number, data: Partial<Pick<Cabinet, 'name' | 'status' | 'plan' | 'routing_mode'>>): Promise<Cabinet> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  /** Met à jour les informations de branding (logo, couleur, coordonnées) utilisées dans les e-mails.
   *  Le logo est reçu en data-URI (`logo_url`) et stocké en blob. */
  async updateBranding(
    id: number,
    data: {
      logo_url?: string | null;
    } & Partial<Pick<Cabinet,
      'brand_color' | 'contact_email' | 'contact_phone' | 'address' | 'website' | 'email_footer' | 'name'
    >>,
  ) {
    const cabinet = await this.findById(id);
    const { logo_url, ...rest } = data;
    Object.assign(cabinet, rest);
    // Décode le data-URI, écrit le fichier statique et met à jour blob + logo_file.
    applyLogoInput(cabinet, logo_url);
    await this.repo.save(cabinet);
    return serializeCabinet(cabinet);
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
