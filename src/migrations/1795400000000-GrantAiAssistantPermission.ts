import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Droit `use_ai_assistant` : utiliser l'assistant IA du cabinet.
 *
 * AiFeatureGuard l'exige désormais sur /api/ai-database (l'administrateur du
 * cabinet garde l'accès par son rôle). Jusqu'ici aucun contrôle n'était
 * appliqué : tous les rôles du cabinet utilisaient l'assistant. Pour ne
 * retirer l'accès à personne, la permission est accordée à tous les rôles
 * existants, sauf `client` (portail client, qui n'atteint pas ces routes).
 * Chaque cabinet peut ensuite la retirer depuis Paramètres › Rôles.
 * PermissionSeeder / RoleSeeder la posent pour les nouveaux cabinets.
 */
export class GrantAiAssistantPermission1795400000000 implements MigrationInterface {
  name = 'GrantAiAssistantPermission1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT IGNORE INTO permission (code, description, canChange, tenant_id)
       SELECT ?, ?, 1, t.tenant_id
         FROM (SELECT DISTINCT tenant_id FROM permission WHERE deleted_at IS NULL) t`,
      ['use_ai_assistant', 'Utiliser l’assistant IA du cabinet'],
    );
    await queryRunner.query(`
      INSERT IGNORE INTO role_permission (role_id, permission_id, tenant_id, status)
      SELECT r.id, p.id, r.tenant_id, 1
        FROM user_role r
        JOIN permission p ON p.tenant_id = r.tenant_id AND p.code = 'use_ai_assistant'
       WHERE r.code <> 'client'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE rp FROM role_permission rp
        JOIN permission p ON p.id = rp.permission_id
       WHERE p.code = 'use_ai_assistant'
    `);
  }
}
