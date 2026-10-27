// src/core/ai-database/user-profile.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { PlansService } from 'src/modules/plans/plans.service';
import { Subscription } from 'src/modules/subscriptions/entities/subscription.entity';
import { getExplicitTenantId } from 'src/core/tenant/tenant.context';
import { AiDatabasePermissionService } from './ai-database-permission.service';
import { AccessProfile } from './ai-access-policy';
import { AiSkillService } from './skills/ai-skill.service';
import {
  PLAN_MODULE_LABELS,
  UserProfileQuota,
  UserProfileSnapshot,
  capabilitiesOf,
} from './user-profile';

const CACHE_TTL_MS = 60_000;

const POSITION_LABELS: Record<string, string> = {
  avocat: 'avocat',
  collaborateur: 'collaborateur',
  juriste: 'juriste',
  comptable: 'comptable',
  secretaire: 'secrétaire',
  assistant: 'assistant',
  stagiaire: 'stagiaire',
  huissier: 'huissier',
  administratif: 'administratif',
  support: 'support',
  apporteur_affaire: "apporteur d'affaires",
};

const LIVE_STATUSES = ['trial', 'active', 'expired', 'suspended', 'pending_payment'];

function daysUntil(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function amount(value: unknown, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} ${currency}`;
}

/**
 * Instantané du profil de l'utilisateur connecté pour le chat IA : chargé une
 * fois par requête (et gardé 60 s), jamais bloquant (null en cas d'erreur).
 */
@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);
  private readonly cache = new Map<string, { at: number; value: Promise<UserProfileSnapshot | null> }>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly permissions: AiDatabasePermissionService,
    @Optional() private readonly plans?: PlansService,
    @Optional() private readonly skills?: AiSkillService,
  ) {}

  async snapshot(user: any): Promise<UserProfileSnapshot | null> {
    const userId = Number(user?.userId ?? user?.id ?? user);
    const tenantId = Number(user?.tenantId) || getExplicitTenantId() || 0;
    if (!Number.isFinite(userId) || userId <= 0) return null;
    const key = `${tenantId}:${userId}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    const value = this.load(user, userId, tenantId).catch((error) => {
      this.logger.warn(`Profil IA indisponible pour user=${userId}: ${error?.message ?? error}`);
      this.cache.delete(key);
      return null;
    });
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }

  /** Droits réels (libellés) : partagés avec la réponse « que puis-je faire ? ». */
  accessProfile(user: any): Promise<AccessProfile> {
    return this.permissions.getAccessProfile(user);
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async load(user: any, userId: number, tenantId: number): Promise<UserProfileSnapshot> {
    const [access, employee, cabinet, subscription, usage, skills] = await Promise.all([
      this.permissions.getAccessProfile(user),
      this.dataSource.getRepository(Employee)
        .findOne({ where: { id: userId } as any, relations: ['user'] })
        .catch(() => null),
      tenantId
        ? this.dataSource.getRepository(Cabinet).findOne({ where: { id: tenantId } as any, relations: ['activePlan'] }).catch(() => null)
        : Promise.resolve(null),
      tenantId
        ? this.dataSource.getRepository(Subscription)
          .findOne({ where: { cabinet_id: tenantId, status: In(LIVE_STATUSES) } as any, order: { created_at: 'DESC' } })
          .catch(() => null)
        : Promise.resolve(null),
      tenantId && this.plans ? this.plans.getQuotaStatus(tenantId).catch(() => null) : Promise.resolve(null),
      this.skills ? this.skills.catalog(user).then((items) => items.length).catch(() => 0) : Promise.resolve(0),
    ]);

    const account: any = (employee as any)?.user ?? null;
    const name = String(account?.full_name || [account?.first_name, account?.last_name].filter(Boolean).join(' ') || user?.username || '').trim();
    const position = String((employee as any)?.position ?? '');
    const canSeeBilling = access.isAdmin || access.permissions.has('manage_subscription');
    const plan: any = (cabinet as any)?.activePlan ?? usage?.plan ?? null;
    const currency = (subscription as any)?.currency || (cabinet as any)?.currency || 'XAF';
    const cycle = (subscription as any)?.billing_cycle ?? 'monthly';
    const price = plan
      ? cycle === 'yearly' && plan.price_yearly
        ? amount(plan.price_yearly, currency) && `${amount(plan.price_yearly, currency)} / an`
        : amount(plan.price_monthly, currency) && `${amount(plan.price_monthly, currency)} / mois`
      : '';

    const quota = usage?.quota ?? null;
    const quotas: UserProfileQuota[] = [];
    const count = (label: string, entry: any) => {
      if (!entry) return;
      quotas.push({ label, used: Number(entry.current ?? 0), max: entry.max === -1 || entry.max == null ? null : Number(entry.max) });
    };
    if (quota) {
      count('Collaborateurs', quota.employees);
      count('Clients', quota.clients);
      count('Dossiers', quota.dossiers);
      if (quota.storage) {
        const usedGb = Math.round((Number(quota.storage.usedBytes ?? 0) / 1024 ** 3) * 100) / 100;
        const maxGb = Number(quota.storage.maxGb);
        quotas.push({ label: 'Stockage', used: usedGb, max: maxGb === -1 || !Number.isFinite(maxGb) ? null : maxGb, unit: 'Go' });
      }
    }
    const aiQuota = quota?.ai_credits;

    return {
      userId,
      name,
      email: String(account?.email ?? user?.email ?? ''),
      position: POSITION_LABELS[position] ?? position,
      roleName: String(user?.role_name ?? access.roleName ?? user?.role ?? ''),
      isAdmin: access.isAdmin,
      ...capabilitiesOf(access),
      cabinet: cabinet ? { name: (cabinet as any).name, code: (cabinet as any).code } : null,
      plan: plan
        ? {
          name: plan.name,
          code: plan.code,
          included: PLAN_MODULE_LABELS.filter((m) => !!plan[m.key]).map((m) => m.label),
          excluded: PLAN_MODULE_LABELS.filter((m) => !plan[m.key]).map((m) => m.label),
          ...(canSeeBilling && price && { price }),
        }
        : null,
      subscription: subscription
        ? {
          status: (subscription as any).status,
          cycle,
          isTrial: !!(subscription as any).is_trial,
          endsAt: iso((subscription as any).ends_at),
          trialEndsAt: iso((subscription as any).trial_ends_at),
          autoRenew: !!(subscription as any).auto_renew,
          daysRemaining: daysUntil((subscription as any).is_trial ? (subscription as any).trial_ends_at ?? (subscription as any).ends_at : (subscription as any).ends_at),
        }
        : null,
      quotas,
      ai: aiQuota
        ? {
          // Pourcentage du forfait : l'assistant ne connaît jamais de crédits ni de montants.
          used: Number(aiQuota.monthPct ?? 0),
          max: aiQuota.unlimited ? null : 100,
          resetsAt: aiQuota.resetsAt ?? null,
          enabled: aiQuota.enabled !== false,
        }
        : null,
      canSeeBilling,
      skills,
    };
  }
}
