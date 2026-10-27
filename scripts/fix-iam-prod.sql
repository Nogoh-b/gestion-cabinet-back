-- =====================================================================
-- CORRECTIF PROD — Doublons d'affichage rôles/permissions (tenant IN 1,X)
-- Base : <adapter : DB_HOST / DB_NAME de la prod>
--
-- CONTEXTE
--   Le code AVANT le fix marquait Permission / UserRole / RolePermission
--   @SharedAcrossTenants → les lectures retournaient tenant_id IN (1, X),
--   donc chaque cabinet voyait SES lignes + celles du cabinet n°1
--   (view_dossiers x2, secretaire x2, …).
--   Le code APRÈS le fix impose une isolation stricte (WHERE tenant_id = X).
--
-- CE SCRIPT NE SUPPRIME AUCUNE DONNÉE MÉTIER. Il répare uniquement les
-- liaisons role_permission incohérentes (tenant de la liaison ≠ tenant du
-- rôle / de la permission), qui sont le seul résidu capable de faire
-- réapparaître des doublons après le déploiement du fix.
--
-- PROCÉDURE
--   1. BACKUP : mysqldump -h <HOST> -u <USER> -p <DB> permission user_role role_permission > iam_backup_$(date +%Y%m%d).sql
--   2. Déployer le code corrigé (git pull + restart backend).
--   3. Exécuter ce script (contrôles + réparation en transaction).
--   4. Redémarrer le backend (les seeders comblent les permissions manquantes
--      par tenant, ex. tenant 14 en local qui avait 166 au lieu de 180).
-- =====================================================================

-- ── CONTRÔLE 1 : vrais doublons intra-tenant (attendu : 0 ligne) ──────────
SELECT code, tenant_id, COUNT(*) AS nb
FROM permission GROUP BY code, tenant_id HAVING COUNT(*) > 1 LIMIT 10;

SELECT code, tenant_id, COUNT(*) AS nb
FROM user_role GROUP BY code, tenant_id HAVING COUNT(*) > 1 LIMIT 10;

-- ── CONTRÔLE 2 : liaisons incohérentes (rôle/permission/liaison pas alignés) ─
SELECT rp.role_id, rp.permission_id, rp.tenant_id,
       r.tenant_id AS role_tenant, r.code AS role_code,
       p.tenant_id AS perm_tenant, p.code AS perm_code
FROM role_permission rp
INNER JOIN user_role r ON r.id = rp.role_id
INNER JOIN permission p ON p.id = rp.permission_id
WHERE r.tenant_id <> rp.tenant_id
   OR p.tenant_id <> rp.tenant_id
   OR r.tenant_id <> p.tenant_id
LIMIT 20;

-- ── RÉPARATION (transaction unique) ────────────────────────────────────────
START TRANSACTION;

-- 3a. Réaligner le tenant de la liaison sur celui du rôle.
UPDATE role_permission rp
INNER JOIN user_role r ON r.id = rp.role_id
SET rp.tenant_id = r.tenant_id
WHERE rp.tenant_id <> r.tenant_id;

-- 3b. Supprimer les liaisons orphelines cross-tenant
--     (rôle d'un tenant lié à la permission d'un AUTRE tenant).
--     Ne supprime que si le rôle garde sa liaison vers SA propre permission
--     (même code, même tenant) — jamais de perte de droit.
DELETE rp FROM role_permission rp
INNER JOIN user_role r ON r.id = rp.role_id
INNER JOIN permission p ON p.id = rp.permission_id
WHERE r.tenant_id <> p.tenant_id
  AND EXISTS (
    SELECT 1 FROM permission p2
    WHERE p2.tenant_id = r.tenant_id
      AND p2.code = p.code
      AND EXISTS (
        SELECT 1 FROM role_permission rp2
        WHERE rp2.role_id = r.id AND rp2.permission_id = p2.id
      )
  );

-- ── VÉRIFICATION POST-RÉPARATION (dans la transaction, attendu : 0) ────────
SELECT COUNT(*) AS incoherences_restantes
FROM role_permission rp
INNER JOIN user_role r ON r.id = rp.role_id
INNER JOIN permission p ON p.id = rp.permission_id
WHERE r.tenant_id <> rp.tenant_id
   OR p.tenant_id <> rp.tenant_id
   OR r.tenant_id <> p.tenant_id;

-- Si incoherences_restantes = 0 → COMMIT, sinon → ROLLBACK.
COMMIT;
-- ROLLBACK;
