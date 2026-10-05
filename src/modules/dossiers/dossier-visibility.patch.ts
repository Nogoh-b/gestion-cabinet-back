import { EntityManager, FindManyOptions, FindOneOptions, In, Repository } from 'typeorm';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { getCurrentRequestUser } from 'src/core/security/request-user.context';
import { Dossier } from './entities/dossier.entity';
import { canBypassConfidentiality } from './dossier-visibility';

/**
 * DossierVisibilityPatch — patch de `Repository.prototype` au démarrage,
 * restreint à la SEULE entité `Dossier`.
 *
 * Il injecte le filtre de confidentialité dans tous les `find*` / `count*` :
 * listes, recherche paginée et comptages passent donc par la règle sans que
 * les services aient à y penser (même principe que TenantRepositoryPatch
 * pour le multi-tenant).
 *
 * Les requêtes construites via `createQueryBuilder` ne sont PAS couvertes :
 * elles doivent appeler `addDossierVisibilityCondition()` explicitement.
 *
 * Pour les traitements internes qui doivent légitimement voir tous les
 * dossiers (relire un dossier qu'on vient de créer, numérotation unique),
 * envelopper l'appel dans `runWithoutRequestUser()`.
 */
@Injectable()
export class DossierVisibilityPatch implements OnModuleInit {
  private readonly logger = new Logger(DossierVisibilityPatch.name);
  private static patched = false;

  onModuleInit() {
    if (DossierVisibilityPatch.patched) return;
    this.patch();
    DossierVisibilityPatch.patched = true;
  }

  private patch() {
    const logger = this.logger;

    /** Le repository courant porte-t-il bien l'entité Dossier ? */
    function isDossierRepository(metadata: any): boolean {
      return metadata?.target === Dossier || metadata?.tableName === 'dossier';
    }

    /**
     * Dossiers explicitement ouverts à l'appelant.
     *
     * Les options `find*` de TypeORM n'acceptent pas de sous-requête : on
     * matérialise donc la liste d'identifiants. Le résultat est mémorisé sur
     * le contexte de requête, donc une seule lecture par requête HTTP.
     */
    async function resolveGrantedIds(manager: EntityManager): Promise<number[]> {
      const user = getCurrentRequestUser();
      if (!user) return [];
      if (user.grantedDossierIds) return user.grantedDossierIds;

      const rows: Array<{ dossier_id: number }> = await manager.query(
        `SELECT dossier_id FROM dossier_access_grant
          WHERE employee_id = ? AND revoked_at IS NULL AND deleted_at IS NULL`,
        [user.userId],
      );
      const ids = rows.map((row) => Number(row.dossier_id));
      // Mémorisation sur le store courant (mutation volontaire : le store
      // est propre à la requête et sert ici de cache).
      user.grantedDossierIds = ids;
      return ids;
    }

    /**
     * Fusionne le filtre de confidentialité dans un `where` TypeORM.
     *
     * « non confidentiel OU explicitement autorisé » s'exprime par un tableau
     * de conditions (OR), qu'il faut distribuer sur chaque branche du `where`
     * déjà présent — sinon les autres critères seraient perdus.
     */
    async function mergeVisibilityWhere(
      manager: EntityManager,
      metadata: any,
      where: any,
    ): Promise<any> {
      if (!isDossierRepository(metadata)) return where;
      if (canBypassConfidentiality()) return where;

      const grantedIds = await resolveGrantedIds(manager);

      // Fail-closed : sans autorisation nominative, seul le non-confidentiel.
      if (grantedIds.length === 0) {
        const clause = { confidentiality_level: false };
        if (!where) return clause;
        if (Array.isArray(where)) return where.map((w) => ({ ...w, ...clause }));
        return { ...where, ...clause };
      }

      const clauses = [
        { confidentiality_level: false },
        { id: In(grantedIds) },
      ];
      const base: any[] = !where ? [{}] : Array.isArray(where) ? where : [where];
      return base.flatMap((branch) =>
        clauses.map((condition) => ({ ...branch, ...condition })),
      );
    }

    const orig = {
      find: Repository.prototype.find,
      findOne: Repository.prototype.findOne,
      findOneBy: Repository.prototype.findOneBy,
      findAndCount: Repository.prototype.findAndCount,
      findBy: Repository.prototype.findBy,
      count: Repository.prototype.count,
      countBy: Repository.prototype.countBy,
    };

    Repository.prototype.find = async function (options?: FindManyOptions<any>) {
      const where = await mergeVisibilityWhere(
        this.manager,
        this.metadata,
        options?.where,
      );
      return orig.find.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.findAndCount = async function (
      options?: FindManyOptions<any>,
    ) {
      const where = await mergeVisibilityWhere(
        this.manager,
        this.metadata,
        options?.where,
      );
      return orig.findAndCount.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.findBy = async function (where: any) {
      return orig.findBy.call(
        this,
        await mergeVisibilityWhere(this.manager, this.metadata, where),
      );
    };

    Repository.prototype.count = async function (options?: FindManyOptions<any>) {
      const where = await mergeVisibilityWhere(
        this.manager,
        this.metadata,
        options?.where,
      );
      return orig.count.call(this, { ...(options ?? {}), where });
    };

    Repository.prototype.countBy = async function (where: any) {
      return orig.countBy.call(
        this,
        await mergeVisibilityWhere(this.manager, this.metadata, where),
      );
    };

    Repository.prototype.findOne = async function (options: FindOneOptions<any>) {
      const where = await mergeVisibilityWhere(
        this.manager,
        this.metadata,
        options?.where,
      );
      return orig.findOne.call(this, { ...options, where });
    };

    Repository.prototype.findOneBy = async function (where: any) {
      return orig.findOneBy.call(
        this,
        await mergeVisibilityWhere(this.manager, this.metadata, where),
      );
    };

    logger.log(
      '✅ Repository.prototype patché — filtre dossiers confidentiels actif (lecture)',
    );
  }
}
