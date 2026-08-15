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
    let resolvedTenantId: number | undefined;

    if (code) {
      const resolved = await this.resolveCode(code);
      if (resolved) {
        resolvedTenantId = resolved;
        (req as any)['resolvedTenantId'] = resolvedTenantId;
        this.logger.debug(`[Tenant] code="${code}" → tenant_id=${resolvedTenantId}`);
      } else {
        this.logger.warn(`[Tenant] code="${code}" non trouvé`);
      }
    }

    // IMPORTANT : si aucun tenant n'est résolu ici, on N'invoque PAS
    // tenantContext.run() avec tenant_id=1 « au cas où ». On laisse le
    // TenantInterceptor (qui tourne après le guard JWT) décider du tenant à
    // partir du JWT. Cela évite qu'une requête sans header active un contexte
    // « cabinet système » qui contournerait l'isolation des données.
    if (resolvedTenantId !== undefined) {
      this.tenantContext.run(resolvedTenantId, next, true);
    } else {
      next();
    }
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

    // 4. Path /cabinets/resolve/:code — route publique de résolution
    const resolveMatch = req.path.match(/^\/cabinets\/resolve\/([a-z0-9]+)(\/|$)/);
    if (resolveMatch) return resolveMatch[1];

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
