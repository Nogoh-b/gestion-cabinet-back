import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  getCurrentRequestUser,
  type RequestUserStore,
} from 'src/core/security/request-user.context';
import { hasActiveTenant } from 'src/core/tenant/tenant.context';
import { UserRole } from 'src/core/enums/user-role.enum';

/**
 * VISIBILITÉ DES DOSSIERS CONFIDENTIELS — source de vérité unique.
 *
 * Règle retenue : un dossier marqué `confidentiality_level = true` n'est
 * visible que par
 *   1. l'administration du cabinet (rôle `admin`, ou permission
 *      `view_dossier_confidential`), et
 *   2. les collaborateurs explicitement autorisés via `dossier_access_grant`.
 *
 * L'affectation métier au dossier (avocat responsable, collaborateurs) ne
 * donne volontairement AUCUN droit de lecture : un dossier confidentiel ne
 * « fuit » pas par l'organisation du travail.
 *
 * Tout ce qui filtre des dossiers (listes, recherche, statistiques,
 * agrégats financiers) doit passer par ce module, afin que la règle ne
 * puisse pas diverger d'un écran à l'autre.
 */

/** Sous-requête des dossiers explicitement ouverts à un collaborateur. */
const GRANTED_DOSSIER_IDS_SQL = `
  SELECT g.dossier_id
    FROM dossier_access_grant g
   WHERE g.employee_id = :__visibilityUserId
     AND g.revoked_at IS NULL
     AND g.deleted_at IS NULL
`;

/**
 * L'appelant voit-il tous les dossiers confidentiels du cabinet ?
 *
 * Hors requête HTTP (script, cron, migration, seeder) il n'y a pas
 * d'appelant à restreindre : l'accès est complet, comme pour le tenant.
 */
export function canBypassConfidentiality(
  user: RequestUserStore | undefined = getCurrentRequestUser(),
): boolean {
  if (!user) return !hasActiveTenant();
  return (
    user.role === UserRole.ADMIN ||
    user.permissions?.includes('view_dossier_confidential') === true
  );
}

/**
 * Faut-il appliquer un filtre de confidentialité à cette requête ?
 *
 * Fail-closed : dans une requête HTTP sans utilisateur résolu (route
 * publique mal protégée, jeton incomplet), on filtre malgré tout — et comme
 * aucun identifiant n'est disponible, aucune autorisation nominative ne
 * s'applique : seuls les dossiers non confidentiels sortent.
 */
export function shouldFilterConfidential(
  user: RequestUserStore | undefined = getCurrentRequestUser(),
): boolean {
  return !canBypassConfidentiality(user);
}

/**
 * Ajoute la condition de visibilité à un QueryBuilder portant sur `dossier`.
 *
 * Usage :
 *   let qb = this.dossierRepository.createQueryBuilder('dossier');
 *   qb = addDossierVisibilityCondition(qb, 'dossier');
 *
 * @param alias alias SQL de la table `dossier` dans la requête.
 */
export function addDossierVisibilityCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
): SelectQueryBuilder<T> {
  const user = getCurrentRequestUser();
  if (canBypassConfidentiality(user)) return qb;

  if (!user) {
    // Aucun appelant identifié : on ne montre que le non-confidentiel.
    return qb.andWhere(`${alias}.confidentiality_level = false`);
  }

  return qb.andWhere(
    `(${alias}.confidentiality_level = false OR ${alias}.id IN (${GRANTED_DOSSIER_IDS_SQL}))`,
    { __visibilityUserId: user.userId },
  );
}

/**
 * Variante pour les requêtes qui joignent `dossier` depuis une autre entité
 * (factures, paiements, audiences…). `dossierAlias` doit déjà être joint.
 *
 * `allowNull` laisse passer les lignes sans dossier rattaché (jointure
 * externe) : elles ne révèlent rien d'un dossier confidentiel.
 */
export function addJoinedDossierVisibilityCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  dossierAlias: string,
  allowNull = true,
): SelectQueryBuilder<T> {
  const user = getCurrentRequestUser();
  if (canBypassConfidentiality(user)) return qb;

  const nullClause = allowNull ? `${dossierAlias}.id IS NULL OR ` : '';

  if (!user) {
    return qb.andWhere(
      `(${nullClause}${dossierAlias}.confidentiality_level = false)`,
    );
  }

  return qb.andWhere(
    `(${nullClause}${dossierAlias}.confidentiality_level = false` +
      ` OR ${dossierAlias}.id IN (${GRANTED_DOSSIER_IDS_SQL}))`,
    { __visibilityUserId: user.userId },
  );
}

/**
 * Filtre une entité RATTACHÉE à un dossier (facture, paiement, audience,
 * document…) sur la seule base de sa clé étrangère, sans exiger de jointure.
 *
 * C'est la variante à privilégier dans les autres modules : elle fonctionne
 * quelle que soit la forme de la requête.
 *
 * Usage :
 *   addRelatedDossierVisibilityCondition(qb, 'facture');          // facture.dossier_id
 *   addRelatedDossierVisibilityCondition(qb, 'p', 'dossier_id');
 *
 * `allowNull` laisse passer les lignes sans dossier rattaché : elles ne
 * révèlent rien d'un dossier confidentiel.
 */
export function addRelatedDossierVisibilityCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  column = 'dossier_id',
  allowNull = true,
): SelectQueryBuilder<T> {
  const user = getCurrentRequestUser();
  if (canBypassConfidentiality(user)) return qb;

  const fk = `${alias}.${column}`;
  const nullClause = allowNull ? `${fk} IS NULL OR ` : '';
  // Attention : la table s'appelle `dossiers` (pluriel, cf. @Entity('dossiers')).
  // Une référence au singulier produit une erreur SQL 1146 « table doesn't exist ».
  const visibleDossiers = `
    SELECT d.id FROM dossiers d
     WHERE d.confidentiality_level = false
  `;

  if (!user) {
    return qb.andWhere(`(${nullClause}${fk} IN (${visibleDossiers}))`);
  }

  return qb.andWhere(
    `(${nullClause}${fk} IN (${visibleDossiers})` +
      ` OR ${fk} IN (${GRANTED_DOSSIER_IDS_SQL}))`,
    { __visibilityUserId: user.userId },
  );
}

/**
 * Décide si un dossier déjà chargé est visible par l'appelant.
 *
 * `grantedDossierIds` doit contenir les dossiers explicitement ouverts à
 * l'appelant (chargés par le service). Fonction pure : testable sans base.
 */
export function isDossierVisible(
  dossier: { id: number; confidentiality_level?: boolean | null },
  grantedDossierIds: ReadonlySet<number> | ReadonlyArray<number> = [],
  user: RequestUserStore | undefined = getCurrentRequestUser(),
): boolean {
  if (!dossier?.confidentiality_level) return true;
  if (canBypassConfidentiality(user)) return true;
  if (!user) return false;
  const granted =
    grantedDossierIds instanceof Set
      ? grantedDossierIds
      : new Set(grantedDossierIds as ReadonlyArray<number>);
  return granted.has(Number(dossier.id));
}
