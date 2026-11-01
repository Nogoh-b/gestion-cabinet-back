import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remplace le DDL qui était exécuté à chaque démarrage de l'application.
 */
export class SetNotificationsRowFormat1785169001000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ TABLE_NAME: string }> = await queryRunner.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'`,
    );
    if (tables.length) {
      await queryRunner.query(
        `ALTER TABLE notifications ROW_FORMAT=DYNAMIC`,
      );
    }
  }

  public async down(): Promise<void> {
    // Aucun retour automatique : le format antérieur n'est pas connaissable.
  }
}
