import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Droits dédiés :
 *  - `export_dossier` : export ZIP hors-ligne des dossiers (données complètes,
 *    PDF, SQL) et « Mes exports ». Remplace `view_dossiers` sur ces routes.
 *    Accordé aux rôles « admin » et « avocat ».
 *  - `record_audience` : enregistrer le son d'une audience, transcrire et
 *    supprimer les enregistrements. Remplace `edit_audience` sur ces routes.
 *    Accordé aux rôles qui ont déjà `edit_audience`.
 *
 * Les permissions sont propres à chaque cabinet (tenant) : on les crée pour
 * chaque tenant qui a déjà un référentiel de permissions. PermissionSeeder /
 * RoleSeeder les posent pour les nouveaux cabinets.
 */
export class ExportAndRecordingPermissions1794500000000 implements MigrationInterface {
  name = 'ExportAndRecordingPermissions1794500000000';

  private readonly permissions: Array<[string, string]> = [
    ['export_dossier', 'Exporter des dossiers (archive ZIP hors-ligne avec SQL) et gérer ses exports'],
    ['record_audience', "Enregistrer le son d'une audience, transcrire et supprimer les enregistrements"],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, description] of this.permissions) {
      await queryRunner.query(
        `INSERT IGNORE INTO permission (code, description, canChange, tenant_id)
         SELECT ?, ?, 1, t.tenant_id
           FROM (SELECT DISTINCT tenant_id FROM permission WHERE deleted_at IS NULL) t`,
        [code, description],
      );
    }

    // export_dossier → rôles « admin » et « avocat » de chaque cabinet.
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p ON p.tenant_id = r.tenant_id AND p.code = 'export_dossier'
       WHERE r.code IN ('admin', 'avocat')
    `);

    // record_audience → tout rôle qui peut déjà modifier une audience.
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT DISTINCT rp.role_id, p.id, rp.tenant_id, 1
        FROM role_permission rp
        JOIN permission edit ON edit.id = rp.permission_id AND edit.code = 'edit_audience'
        JOIN permission p ON p.tenant_id = rp.tenant_id AND p.code = 'record_audience'
       WHERE rp.deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permission rp
        JOIN permission p ON p.id = rp.permission_id
       WHERE p.code IN ('export_dossier', 'record_audience')
    `);
    await queryRunner.query(`DELETE FROM permission WHERE code IN ('export_dossier', 'record_audience')`);
  }
}
