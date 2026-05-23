import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import { getCurrentTenantId, hasActiveTenant } from './tenant.context';

/**
 * TenantRepositoryPatch — patch unique de Repository.prototype au démarrage.
 *
 * Intercepte TOUS les appels find / findOne / findOneBy / findAndCount / count
 * sur n'importe quel Repository TypeORM et injecte automatiquement
 * `WHERE tenant_id = <tenantId courant>` quand l'entité possède la colonne.
 *
 * Résultat : zéro changement dans les services existants pour les requêtes find*.
 *
 * Pour les QueryBuilder (createQueryBuilder), utiliser le helper :
 *   import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
 *   qb = addTenantCondition(qb, 'alias');
 */
@Injectable()
export class TenantRepositoryPatch implements OnModuleInit {
  private readonly logger = new Logger(TenantRepositoryPatch.name);
  private static patched = false;

  onModuleInit() {
    if (TenantRepositoryPatch.patched) return;
    this.patch();
    TenantRepositoryPatch.patched = true;
  }

  private patch() {
    const logger = this.logger;

    /** Retourne true si l'entité gère le multi-tenant */
    function hasTenantColumn(metadata: any): boolean {
      return !!metadata?.columns?.some((c: any) => c.propertyName === 'tenant_id');
    }

    /** Ajoute tenant_id à un objet where (simple, tableau ou undefined) */
    function mergeTenantWhere(metadata: any, where: any): any {
      if (!hasTenantColumn(metadata)) return where; // entité non-tenante — pas de filtre
      if (!hasActiveTenant()) return where;          // hors contexte HTTP → accès complet
      const tenantId = getCurrentTenantId();
      if (!where)                   return { tenant_id: tenantId };
      if (Array.isArray(where))     return where.map((w) => ({ ...w, tenant_id: tenantId }));
      return { ...where, tenant_id: tenantId };
    }

    const orig = {
      find:          Repository.prototype.find,
      findOne:       Repository.prototype.findOne,
      findOneBy:     Repository.prototype.findOneBy,
      findAndCount:  Repository.prototype.findAndCount,
      findBy:        Repository.prototype.findBy,
      count:         Repository.prototype.count,
      countBy:       Repository.prototype.countBy,
      exists:        (Repository.prototype as any).exists,
    };

    Repository.prototype.find = function (options?: FindManyOptions<any>) {
      const where = mergeTenantWhere(this.metadata, options?.where);
      return orig.find.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.findOne = function (options: FindOneOptions<any>) {
      const where = mergeTenantWhere(this.metadata, options?.where);
      return orig.findOne.call(this, { ...options, where });
    };

    Repository.prototype.findOneBy = function (where: any) {
      return orig.findOneBy.call(this, mergeTenantWhere(this.metadata, where));
    };

    Repository.prototype.findAndCount = function (options?: FindManyOptions<any>) {
      const where = mergeTenantWhere(this.metadata, options?.where);
      return orig.findAndCount.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.findBy = function (where: any) {
      return orig.findBy.call(this, mergeTenantWhere(this.metadata, where));
    };

    Repository.prototype.count = function (options?: FindManyOptions<any>) {
      const where = mergeTenantWhere(this.metadata, options?.where);
      return orig.count.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.countBy = function (where: any) {
      return orig.countBy.call(this, mergeTenantWhere(this.metadata, where));
    };

    if (orig.exists) {
      (Repository.prototype as any).exists = function (options?: FindManyOptions<any>) {
        const where = mergeTenantWhere(this.metadata, options?.where);
        return orig.exists.call(this, { ...(options ?? {}), where });
      };
    }

    logger.log('✅ Repository.prototype patché — filtre tenant_id automatique actif');
  }
}

// ─── Helper QueryBuilder ──────────────────────────────────────────────────────

import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

/**
 * Helper pour les services qui utilisent createQueryBuilder().
 * Ajoute automatiquement WHERE alias.tenant_id = <tenantId courant>.
 *
 * Usage :
 *   let qb = this.repo.createQueryBuilder('d');
 *   qb = addTenantCondition(qb, 'd');
 *   return qb.getMany();
 */
export function addTenantCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  // N'applique le filtre que si un contexte tenant est réellement actif (requête HTTP normale).
  // Sans contexte (script, cron, migration, super-admin global) → pas de filtre, accès complet.
  if (!hasActiveTenant()) return qb;
  return qb.andWhere(`${alias}.tenant_id = :_tenantId`, { _tenantId: getCurrentTenantId() });
}
