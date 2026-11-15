import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import {
  GUIDE_PLAN_FLAGS,
  GuideOverrideRow,
  GuideViewer,
  filterForViewer,
  parseJson,
  readGuideVersion,
} from './guide-overrides';

export interface GuideCaller {
  tenantId: number;
  userId: number;
  role?: string | null;
  base_role?: string | null;
  permissions?: string[];
}

export interface GuideOverridesPayload {
  version: string;
  items: GuideOverrideRow[];
}

/** Métier par défaut, comme `guessProfile` du front. */
function guessProfile(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
      return 'admin';
    case 'comptable':
      return 'comptable';
    case 'secretaire':
    case 'support':
      return 'secretariat';
    default:
      return 'avocat';
  }
}

/**
 * Surcharges publiées de la prise en main, filtrées pour l'utilisateur.
 * Les lignes publiées sont gardées en mémoire tant que la version ne change pas.
 */
@Injectable()
export class GuideService {
  private cache: { version: string; rows: GuideOverrideRow[] } | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly planQuota: PlanQuotaService,
  ) {}

  async forCaller(caller: GuideCaller): Promise<{ payload: GuideOverridesPayload; etag: string }> {
    const [published, viewer] = await Promise.all([this.published(), this.viewer(caller)]);
    const payload = { version: published.version, items: filterForViewer(published.rows, viewer) };
    const etag = `"${createHash('sha1').update(JSON.stringify(payload)).digest('base64url')}"`;
    return { payload, etag };
  }

  private async published(): Promise<{ version: string; rows: GuideOverrideRow[] }> {
    const version = await readGuideVersion(this.db);
    if (this.cache?.version === version) return this.cache;
    let raw: Array<{ kind: GuideOverrideRow['kind']; target: string; data: unknown }> = [];
    try {
      raw = await this.db.query(
        'SELECT kind, target, data FROM guide_overrides WHERE data IS NOT NULL ORDER BY id',
      );
    } catch {
      // Table absente (migration non jouée) : contenu d'origine seulement.
      raw = [];
    }
    const rows = raw
      .map((row) => ({ kind: row.kind, target: row.target, data: parseJson(row.data) }))
      .filter((row): row is GuideOverrideRow => !!row.data && typeof row.data === 'object');
    this.cache = { version, rows };
    return this.cache;
  }

  private async viewer(caller: GuideCaller): Promise<GuideViewer> {
    const permissions = caller.permissions ?? [];
    const role = caller.base_role || caller.role || null;
    const [plan, profile] = await Promise.all([
      this.planQuota.getCabinetPlan(caller.tenantId).catch(() => null),
      this.profile(caller),
    ]);
    return {
      permissions,
      isAdmin: caller.role === 'admin' || role === 'admin' || permissions.includes('SUPER_ADMIN'),
      profile: profile ?? guessProfile(role),
      plan: plan
        ? Object.fromEntries(GUIDE_PLAN_FLAGS.map((flag) => [flag, PlanQuotaService.planIncludes(plan, flag)]))
        : null,
    };
  }

  private async profile(caller: GuideCaller): Promise<string | null> {
    try {
      const rows: Array<{ tours: unknown }> = await this.db.query(
        'SELECT onboarding_tours AS tours FROM user_settings WHERE user_id = ? AND tenant_id = ? LIMIT 1',
        [caller.userId, caller.tenantId],
      );
      const profile = parseJson(rows[0]?.tours)?.profile;
      return typeof profile === 'string' && profile ? profile : null;
    } catch {
      return null;
    }
  }
}
