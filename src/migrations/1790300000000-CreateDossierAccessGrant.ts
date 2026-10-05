import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autorisations nominatives d'accès aux dossiers confidentiels.
 *
 * Nouvelle règle : un dossier confidentiel n'est visible que de
 * l'administration du cabinet et des collaborateurs explicitement autorisés.
 * L'affectation métier (avocat responsable, `dossier_collaborators`) ne vaut
 * plus droit de lecture.
 *
 * Pour éviter que la mise en production ne coupe brutalement l'accès aux
 * personnes qui travaillent déjà sur des dossiers confidentiels, on convertit
 * les affectations existantes en autorisations explicites. L'administration
 * peut ensuite les révoquer une à une depuis la fiche du dossier.
 */
export class CreateDossierAccessGrant1790300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_access_grant (
        id INT NOT NULL AUTO_INCREMENT,
        dossier_id INT NOT NULL,
        employee_id INT NOT NULL,
        granted_by INT NULL,
        granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME NULL,
        reason TEXT NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        INDEX IDX_dossier_access_grant_tenant (tenant_id),
        INDEX IDX_dossier_access_grant_lookup (dossier_id, employee_id),
        INDEX IDX_dossier_access_grant_employee (employee_id)
      ) ENGINE=InnoDB
    `);

    // ── Reprise : avocat responsable des dossiers confidentiels ─────────────
    await queryRunner.query(`
      INSERT INTO dossier_access_grant
        (dossier_id, employee_id, granted_by, granted_at, reason, tenant_id)
      SELECT d.id, d.lawyer_id, NULL, NOW(),
             'Reprise : avocat responsable au moment de la migration', d.tenant_id
        FROM dossiers d
       WHERE d.confidentiality_level = 1
         AND d.lawyer_id IS NOT NULL
         AND d.deleted_at IS NULL
         AND NOT EXISTS (
               SELECT 1 FROM dossier_access_grant g
                WHERE g.dossier_id = d.id AND g.employee_id = d.lawyer_id
             )
    `);

    // ── Reprise : collaborateurs affectés aux dossiers confidentiels ────────
    await queryRunner.query(`
      INSERT INTO dossier_access_grant
        (dossier_id, employee_id, granted_by, granted_at, reason, tenant_id)
      SELECT d.id, dc.user_id, NULL, NOW(),
             'Reprise : collaborateur affecté au moment de la migration', d.tenant_id
        FROM dossiers d
        JOIN dossier_collaborators dc ON dc.dossier_id = d.id
       WHERE d.confidentiality_level = 1
         AND d.deleted_at IS NULL
         AND NOT EXISTS (
               SELECT 1 FROM dossier_access_grant g
                WHERE g.dossier_id = d.id AND g.employee_id = dc.user_id
             )
    `);

    // ── `view_dossier_confidential` redevient un droit d'administration ─────
    // Ce droit donne désormais accès à TOUS les dossiers confidentiels : il ne
    // doit plus être porté par le rôle « avocat ». RoleSeeder ne touchant pas
    // aux rôles existants, la révocation se fait ici.
    await queryRunner.query(`
      DELETE rp FROM role_permission rp
        JOIN user_role r ON r.id = rp.role_id
        JOIN permission p ON p.id = rp.permission_id
       WHERE r.code = 'avocat'
         AND p.code = 'view_dossier_confidential'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rend `view_dossier_confidential` au rôle avocat (comportement d'avant).
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p
          ON p.tenant_id = r.tenant_id
         AND p.code = 'view_dossier_confidential'
       WHERE r.code = 'avocat'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS dossier_access_grant`);
  }
}
