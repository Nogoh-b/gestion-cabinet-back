import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant.context';

/**
 * TenantResolverMiddleware — résout le cabinet (tenant) depuis la requête HTTP.
 *
 * Sources de résolution (dans l'ordre de priorité) :
 *   1. Header  : x-tenant-code: <code>
 *   2. Subdomain : <code>.mon-app.com  (Host header)
 *   3. Path    : /t/<code>/...
 *
 * Résultat : req['resolvedTenantId'] = cabinet.id (ou undefined si non résolu).
 *
 * Le TenantInterceptor complète ensuite :
 *   tenantId = req.user?.tenantId ?? req['resolvedTenantId'] ?? 1
 */
@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  /** Cache mémoire simple code → id pour éviter les requêtes DB répétées */
  private readonly cache = new Map<string, number>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const code = this.extractCode(req);
    let tenantId = 1; // défaut (cabinet système)

    if (code) {
      const resolved = await this.resolveCode(code);
      if (resolved) {
        tenantId = resolved;
        (req as any)['resolvedTenantId'] = tenantId;
        this.logger.debug(`[Tenant] code="${code}" → tenant_id=${tenantId}`);
      } else {
        this.logger.warn(`[Tenant] code="${code}" non trouvé`);
      }
    }

    /**
     * CRITIQUE — appeler next() DANS tenantContext.run() et non après.
     *
     * Les guards NestJS s'exécutent AVANT les interceptors.
     * Si on appelait next() en dehors, le LocalAuthGuard (et validateUser)
     * tourneraient avec tenant_id = défaut, permettant une connexion
     * cross-tenant. En enveloppant next() ici, tout le pipeline NestJS
     * (guards → interceptors → handler) hérite du bon contexte AsyncLocalStorage.
     */
    this.tenantContext.run(tenantId, next);
  }

  // ── Extraction du code ────────────────────────────────────────────

  private extractCode(req: Request): string | null {
    // 1. Header x-tenant-code
    const header = req.headers['x-tenant-code'];
    if (header && typeof header === 'string' && header.trim()) {
      return header.trim().toLowerCase();
    }

    // 2. Subdomain — ex: xk7m2p8a.mon-app.com
    const host = req.hostname ?? '';
    const baseDomain = process.env.BASE_DOMAIN ?? '';
    if (baseDomain && host.endsWith(`.${baseDomain}`)) {
      const sub = host.slice(0, host.length - baseDomain.length - 1);
      if (sub && this.isValidCode(sub)) return sub;
    }

    // 3. Path /t/<code>/...
    const match = req.path.match(/^\/t\/([a-z0-9]+)(\/|$)/);
    if (match) return match[1];

    return null;
  }

  private isValidCode(code: string): boolean {
    return /^[a-z][a-z0-9]{3,11}$/.test(code); // 4–12 chars, commence par lettre
  }

  // ── Résolution DB avec cache ──────────────────────────────────────

  private async resolveCode(code: string): Promise<number | null> {
    if (this.cache.has(code)) return this.cache.get(code)!;

    try {
      const row = await this.dataSource.query(
        `SELECT id FROM cabinets WHERE code = ? LIMIT 1`,
        [code],
      );
      const id: number | null = row?.[0]?.id ?? null;
      if (id) this.cache.set(code, id);
      return id;
    } catch (err) {
      this.logger.error(`[Tenant] Erreur résolution code "${code}": ${err?.message}`);
      return null;
    }
  }
}
