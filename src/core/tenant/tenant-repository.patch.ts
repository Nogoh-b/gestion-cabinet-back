import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Repository, FindManyOptions, FindOneOptions, SaveOptions, RemoveOptions } from 'typeorm';
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
      save:          Repository.prototype.save,
      update:        (Repository.prototype as any).update,
      delete:        (Repository.prototype as any).delete,
      softDelete:    (Repository.prototype as any).softDelete,
      restore:       (Repository.prototype as any).restore,
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

    // ── ÉCRITURE : save ────────────────────────────────────────────────────────
    // @BeforeInsert sur TenantEntity gère le tenant_id pour les nouvelles entités.
    // Pour save() sur des entités existantes (UPDATE), on s'assure que
    // tenant_id n'est pas écrasé par une valeur étrangère.
    Repository.prototype.save = function (entity: any, options?: SaveOptions) {
      if (hasTenantColumn(this.metadata) && hasActiveTenant()) {
        const tenantId = getCurrentTenantId();
        if (Array.isArray(entity)) {
          entity.forEach(e => { e.tenant_id = tenantId; });
        } else {
          entity.tenant_id = tenantId;
        }
      }
      return orig.save.call(this, entity, options);
    };

    // ── ÉCRITURE : update ──────────────────────────────────────────────────────
    // Ajoute tenant_id dans le criteria pour éviter de modifier des lignes
    // d'un autre cabinet. Retire tenant_id du partialEntity pour empêcher
    // qu'un appelant le change accidentellement.
    (Repository.prototype as any).update = function (criteria: any, partialEntity: any) {
      if (hasTenantColumn(this.metadata) && hasActiveTenant()) {
        const tenantId = getCurrentTenantId();
        // Empêche d'écraser le tenant_id dans les données mises à jour
        const { tenant_id: _ignored, ...safePartial } = partialEntity ?? {};
        // Ajoute le filtre tenant dans le criteria
        const safeCriteria = (typeof criteria === 'number' || typeof criteria === 'string')
          ? { id: criteria, tenant_id: tenantId }
          : Array.isArray(criteria)
            ? criteria // tableau d'IDs — TypeORM gère comme IN(ids), pas de mélange avec obj
            : { ...criteria, tenant_id: tenantId };
        return orig.update.call(this, safeCriteria, safePartial);
      }
      return orig.update.call(this, criteria, partialEntity);
    };

    // ── SUPPRESSION : delete ───────────────────────────────────────────────────
    // Ajoute tenant_id dans le criteria pour ne supprimer que dans le bon cabinet.
    (Repository.prototype as any).delete = function (criteria: any) {
      if (hasTenantColumn(this.metadata) && hasActiveTenant()) {
        const tenantId = getCurrentTenantId();
        const safeCriteria = (typeof criteria === 'number' || typeof criteria === 'string')
          ? { id: criteria, tenant_id: tenantId }
          : Array.isArray(criteria)
            ? criteria
            : { ...criteria, tenant_id: tenantId };
        return orig.delete.call(this, safeCriteria);
      }
      return orig.delete.call(this, criteria);
    };

    // ── SUPPRESSION LOGIQUE : softDelete / restore ─────────────────────────────
    (Repository.prototype as any).softDelete = function (criteria: any) {
      if (hasTenantColumn(this.metadata) && hasActiveTenant()) {
        const tenantId = getCurrentTenantId();
        const safeCriteria = (typeof criteria === 'number' || typeof criteria === 'string')
          ? { id: criteria, tenant_id: tenantId }
          : Array.isArray(criteria)
            ? criteria
            : { ...criteria, tenant_id: tenantId };
        return orig.softDelete.call(this, safeCriteria);
      }
      return orig.softDelete.call(this, criteria);
    };

    if (orig.restore) {
      (Repository.prototype as any).restore = function (criteria: any) {
        if (hasTenantColumn(this.metadata) && hasActiveTenant()) {
          const tenantId = getCurrentTenantId();
          const safeCriteria = (typeof criteria === 'number' || typeof criteria === 'string')
            ? { id: criteria, tenant_id: tenantId }
            : Array.isArray(criteria)
              ? criteria
              : { ...criteria, tenant_id: tenantId };
          return orig.restore.call(this, safeCriteria);
        }
        return orig.restore.call(this, criteria);
      };
    }

    logger.log('✅ Repository.prototype patché — filtre tenant_id automatique actif (lecture + écriture)');
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
