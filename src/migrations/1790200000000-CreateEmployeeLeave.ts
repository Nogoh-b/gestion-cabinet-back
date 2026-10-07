import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permissions (congés) des collaborateurs : le collaborateur dépose une
 * demande depuis son profil, l'administrateur la valide, la refuse ou
 * l'annule depuis la fiche du collaborateur.
 *
 * Ajoute au passage `cancel_reason` aux avances sur salaire, pour que
 * l'annulation d'une avance soit motivée au même titre qu'un congé.
 *
 * Idempotent (`CREATE TABLE IF NOT EXISTS`) : la base de dev tourne en
 * `synchronize:true` et a déjà pu matérialiser la table.
 */
export class CreateEmployeeLeave1790200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_leave (
        id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
        decision_reason TEXT NULL,
        decided_by INT NULL,
        decided_at DATETIME NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        INDEX IDX_employee_leave_tenant (tenant_id),
        INDEX IDX_employee_leave_employee (employee_id),
        INDEX IDX_employee_leave_status (status)
      ) ENGINE=InnoDB
    `);

    const advanceColumns: Array<{ COLUMN_NAME: string }> =
      await queryRunner.query(
        `SHOW COLUMNS FROM salary_advance LIKE 'cancel_reason'`,
      );
    if (advanceColumns.length === 0) {
      await queryRunner.query(
        `ALTER TABLE salary_advance ADD COLUMN cancel_reason TEXT NULL AFTER reason`,
      );
    }

    // ── Droits sur les nouvelles demandes ───────────────────────────────────
    // RoleSeeder crée bien les permissions manquantes au démarrage, mais
    // n'assigne les droits par défaut QU'AUX rôles nouvellement créés : sur
    // une base existante, `admin` et `secretaire` ne recevraient donc jamais
    // ces permissions. On les rattache explicitement ici.
    await queryRunner.query(`
      INSERT IGNORE INTO permission (code, description, tenant_id, status)
      VALUES
        ('request_leave', 'Demander une permission (congé) pour soi-même', 1, 1),
        ('request_salary_advance', 'Demander une avance sur salaire pour soi-même', 1, 1),
        ('view_employee_requests', 'Voir les demandes de permission et d''avance des collaborateurs', 1, 1),
        ('manage_employee_requests', 'Valider, refuser ou annuler les demandes des collaborateurs', 1, 1)
    `);

    // Gestionnaires RH : accès complet aux demandes.
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p
          ON p.tenant_id = r.tenant_id
         AND p.code IN (
               'request_leave', 'request_salary_advance',
               'view_employee_requests', 'manage_employee_requests'
             )
       WHERE r.code IN ('admin', 'secretaire')
    `);

    // Autres collaborateurs : uniquement le dépôt de leurs propres demandes.
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p
          ON p.tenant_id = r.tenant_id
         AND p.code IN ('request_leave', 'request_salary_advance')
       WHERE r.code IN ('avocat', 'collaborateur', 'comptable', 'huissier', 'stagiaire')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permission rp
        JOIN permission p ON p.id = rp.permission_id
       WHERE p.code IN (
               'request_leave', 'request_salary_advance',
               'view_employee_requests', 'manage_employee_requests'
             )
    `);
    await queryRunner.query(`
      DELETE FROM permission
       WHERE code IN (
               'request_leave', 'request_salary_advance',
               'view_employee_requests', 'manage_employee_requests'
             )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS employee_leave`);

    const advanceColumns: Array<{ COLUMN_NAME: string }> =
      await queryRunner.query(
        `SHOW COLUMNS FROM salary_advance LIKE 'cancel_reason'`,
      );
    if (advanceColumns.length > 0) {
      await queryRunner.query(
        `ALTER TABLE salary_advance DROP COLUMN cancel_reason`,
      );
    }
  }
}
