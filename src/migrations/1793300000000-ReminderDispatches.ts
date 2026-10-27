import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journal des alertes automatiques déjà envoyées (diligences, délais de
 * recours). Le planificateur réserve une ligne AVANT de notifier : la clé
 * unique empêche les doublons après un redémarrage, avec plusieurs instances
 * du back ou un back de dev branché sur la même base.
 */
export class ReminderDispatches1793300000000 implements MigrationInterface {
  name = 'ReminderDispatches1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`reminder_dispatches\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\` INT NOT NULL,
        \`kind\` VARCHAR(40) NOT NULL,
        \`ref_key\` VARCHAR(160) NOT NULL,
        \`sent_on\` DATE NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_reminder_dispatch\` (\`tenant_id\`, \`kind\`, \`ref_key\`, \`sent_on\`),
        KEY \`IDX_reminder_dispatch_created\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `reminder_dispatches`');
  }
}
