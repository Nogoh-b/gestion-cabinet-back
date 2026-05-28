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

export type QuotaResource = 'employees' | 'clients' | 'dossiers';

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

    const limitMap: Record<QuotaResource, number> = {
      employees: plan.max_employees,
      clients:   plan.max_clients,
      dossiers:  plan.max_dossiers,
    };

    const labelMap: Record<QuotaResource, string> = {
      employees: 'collaborateurs',
      clients:   'clients',
      dossiers:  'dossiers',
    };

    const max = limitMap[resource];
    if (max !== null && max !== undefined && currentCount >= max) {
      throw new ForbiddenException(
        `Limite de ${labelMap[resource]} atteinte (${currentCount}/${max}). ` +
        `Veuillez mettre à niveau votre plan "${plan.name}" pour continuer.`,
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private buildUsage(
    resource: QuotaResource,
    current: number,
    max: number | null,
  ): QuotaUsage {
    const percentage = max ? Math.min(100, Math.round((current / max) * 100)) : 0;
    return {
      resource,
      current,
      max: max ?? -1, // -1 = illimité
      percentage,
      exceeded: max !== null && current >= max,
    };
  }
}
