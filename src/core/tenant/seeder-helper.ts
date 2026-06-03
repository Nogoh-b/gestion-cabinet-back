/**
 * Helper pour les seeders multi-tenant.
 *
 * Les seeders doivent vérifier l'existence d'un enregistrement POUR LE TENANT
 * en cours uniquement (pas le fallback In([1, tenantId]) du patch Repository).
 *
 * Ce helper utilise createQueryBuilder() (non patché) avec un filtre exact
 * sur tenant_id, ce qui permet de créer des copies indépendantes des données
 * de référence pour chaque cabinet.
 */
import { Repository, ObjectLiteral } from 'typeorm';
import { getCurrentTenantId, hasActiveTenant } from './tenant.context';

/**
 * Vérifie si un enregistrement existe pour le tenant courant.
 *
 * Utilise QueryBuilder (non patché) pour un filtre exact :
 *   WHERE column = value AND tenant_id = <currentTenantId>
 *
 * @param repo      — le Repository TypeORM
 * @param column    — nom de la colonne à vérifier (ex: 'code')
 * @param value     — valeur à chercher
 * @param alias     — alias de la table (défaut: 'e')
 * @returns         — l'entité trouvée ou null
 */
export async function findOneForTenant<T extends ObjectLiteral>(
  repo: Repository<T>,
  column: string,
  value: any,
  alias = 'e',
): Promise<T | null> {
  const qb = repo.createQueryBuilder(alias)
    .where(`${alias}.${column} = :val`, { val: value });

  // Filtre tenant exact (pas de fallback vers tenant_id=1)
  if (hasActiveTenant()) {
    qb.andWhere(`${alias}.tenant_id = :tid`, { tid: getCurrentTenantId() });
  }

  return qb.getOne();
}

/**
 * Vérifie l'existence par un objet where multi-colonnes pour le tenant courant.
 */
export async function existsForTenant<T extends ObjectLiteral>(
  repo: Repository<T>,
  where: Record<string, any>,
  alias = 'e',
): Promise<boolean> {
  const qb = repo.createQueryBuilder(alias);

  for (const [col, val] of Object.entries(where)) {
    qb.andWhere(`${alias}.${col} = :${col}`, { [col]: val });
  }

  if (hasActiveTenant()) {
    qb.andWhere(`${alias}.tenant_id = :tid`, { tid: getCurrentTenantId() });
  }

  return (await qb.getCount()) > 0;
}
