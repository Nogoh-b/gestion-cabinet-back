import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Droit `view_all_dossiers` : voir et ouvrir tous les dossiers du cabinet sans
 * en être membre (la confidentialité reste due). Sans lui, le personnel ne voit
 * que les dossiers dont il est membre actif ou avocat responsable.
 *
 * Créé pour chaque cabinet qui a déjà un référentiel de permissions, accordé
 * au rôle « admin » (qui y a déjà accès par son rôle) pour qu'il apparaisse
 * coché ; les autres rôles l'obtiennent depuis Paramètres › Rôles.
 * PermissionSeeder / RoleSeeder le posent pour les nouveaux cabinets.
 */
export class ViewAllDossiersPermission1794800000000 implements MigrationInterface {
  name = 'ViewAllDossiersPermission1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT IGNORE INTO permission (code, description, canChange, tenant_id)
       SELECT ?, ?, 1, t.tenant_id
         FROM (SELECT DISTINCT tenant_id FROM permission WHERE deleted_at IS NULL) t`,
      [
        'view_all_dossiers',
        'Voir tous les dossiers du cabinet, même sans en être membre (hors dossiers confidentiels)',
      ],
    );
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p ON p.tenant_id = r.tenant_id AND p.code = 'view_all_dossiers'
       WHERE r.code = 'admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permission rp
        JOIN permission p ON p.id = rp.permission_id
       WHERE p.code = 'view_all_dossiers'
    `);
    await queryRunner.query(`DELETE FROM permission WHERE code = 'view_all_dossiers'`);
  }
}
