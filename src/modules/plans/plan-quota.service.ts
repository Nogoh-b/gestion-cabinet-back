// src/modules/plans/plan-quota.service.ts
//
// Service central pour :
//  - Récupérer le plan actif d'un cabinet
//  - Calculer l'état d'utilisation (usage vs limites)
//  - Vérifier et bloquer si une limite est dépassée
//
import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Plan } from './entities/plan.entity';

export type QuotaResource =
  | 'employees'
  | 'clients'
  | 'dossiers'
  | 'branches'
  | 'audiences'
  | 'payslips'
  | 'expenses';

export type PlanModule = 'payroll' | 'expenses' | 'invoicing' | 'reporting' | 'ai';

export interface QuotaUsage {
  resource: QuotaResource;
  current: number;
  max: number;
  percentage: number;
  exceeded: boolean;
}

export interface PlanUsageStatus {
  plan: Plan | null;
  hasPlan: boolean;
  quota: {
    employees: QuotaUsage;
    clients: QuotaUsage;
    dossiers: QuotaUsage;
  };
}

@Injectable()
export class PlanQuotaService {
  constructor(
    @InjectRepository(Cabinet)
    private cabinetRepo: Repository<Cabinet>,
  ) {}

  // ── Récupère le plan actif du cabinet ────────────────────────────────────

  async getCabinetPlan(cabinetId: number): Promise<Plan | null> {
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
      relations: ['activePlan'],
    });
    return cabinet?.activePlan ?? null;
  }

  // ── Retourne l'état complet d'utilisation (pour l'affichage front) ───────

  async getUsageStatus(
    cabinetId: number,
    counts: { employees: number; clients: number; dossiers: number },
  ): Promise<PlanUsageStatus> {
    const plan = await this.getCabinetPlan(cabinetId);

    if (!plan) {
      // Pas de plan lié — pas de limites affichées
      return {
        plan: null,
        hasPlan: false,
        quota: {
          employees: this.buildUsage('employees', counts.employees, null),
          clients:   this.buildUsage('clients',   counts.clients,   null),
          dossiers:  this.buildUsage('dossiers',  counts.dossiers,  null),
        },
      };
    }

    return {
      plan,
      hasPlan: true,
      quota: {
        employees: this.buildUsage('employees', counts.employees, plan.max_employees),
        clients:   this.buildUsage('clients',   counts.clients,   plan.max_clients),
        dossiers:  this.buildUsage('dossiers',  counts.dossiers,  plan.max_dossiers),
      },
    };
  }

  // ── Vérifie une limite et lève ForbiddenException si dépassée ────────────

  async checkLimit(
    cabinetId: number,
    resource: QuotaResource,
    currentCount: number,
  ): Promise<void> {
    const plan = await this.getCabinetPlan(cabinetId);
    if (!plan) return; // aucun plan → pas de limite

    const limitMap: Record<QuotaResource, number | null> = {
      employees: plan.max_employees,
      clients:   plan.max_clients,
      dossiers:  plan.max_dossiers,
      branches:  plan.max_branches,
      audiences: plan.max_audiences,
      payslips:  plan.max_payslips_per_month,
      expenses:  plan.max_expenses_per_month,
    };

    const labelMap: Record<QuotaResource, string> = {
      employees: 'collaborateurs',
      clients:   'clients',
      dossiers:  'dossiers',
      branches:  'agences',
      audiences: 'audiences',
      payslips:  'bulletins de paie',
      expenses:  'dépenses',
    };

    const max = limitMap[resource];
    // -1 signifie illimité (plan Enterprise) → aucune vérification
    if (max !== null && max !== undefined && max !== -1 && currentCount >= max) {
      throw new ForbiddenException(
        `Limite de ${labelMap[resource]} atteinte (${currentCount}/${max}). ` +
        `Veuillez mettre à niveau votre plan "${plan.name}" pour continuer.`,
      );
    }
  }

  // ── Vérifie qu'un module est activé sur le plan du cabinet ───────────────

  async isModuleEnabled(cabinetId: number, module: PlanModule): Promise<boolean> {
    const plan = await this.getCabinetPlan(cabinetId);
    if (!plan) return true; // aucun plan → on n'empêche rien

    const map: Record<PlanModule, boolean> = {
      payroll:   !!plan.payroll_enabled,
      expenses:  !!plan.expenses_enabled,
      invoicing: !!plan.invoicing_enabled,
      reporting: !!plan.reporting_enabled,
      ai:        !!plan.ai_enabled,
    };
    return map[module];
  }

  async checkModuleEnabled(cabinetId: number, module: PlanModule): Promise<void> {
    const enabled = await this.isModuleEnabled(cabinetId, module);
    if (!enabled) {
      const plan = await this.getCabinetPlan(cabinetId);
      const labelMap: Record<PlanModule, string> = {
        payroll:   'la paie',
        expenses:  'la gestion des dépenses',
        invoicing: 'la facturation',
        reporting: 'les rapports avancés',
        ai:        "l'assistant IA",
      };
      throw new ForbiddenException(
        `Le module "${labelMap[module]}" n'est pas inclus dans votre plan ` +
        `"${plan?.name ?? ''}". Veuillez mettre à niveau votre abonnement.`,
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildUsage(
    resource: QuotaResource,
    current: number,
    max: number | null,
  ): QuotaUsage {
    const unlimited = max === null || max === -1;
    const effectiveMax = unlimited ? -1 : max!;
    const percentage = unlimited ? 0 : Math.min(100, Math.round((current / effectiveMax) * 100));
    return {
      resource,
      current,
      max: effectiveMax, // -1 = illimité
      percentage,
      exceeded: !unlimited && current >= effectiveMax,
    };
  }
}
