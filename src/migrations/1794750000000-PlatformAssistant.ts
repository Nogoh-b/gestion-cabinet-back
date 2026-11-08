import { MigrationInterface, QueryRunner } from 'typeorm';

/** Assistant de la console plateforme : historique et propositions d'action. */
export class PlatformAssistant1794750000000 implements MigrationInterface {
  name = 'PlatformAssistant1794750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_assistant_messages (
        id varchar(36) NOT NULL,
        admin_id int NOT NULL,
        role varchar(20) NOT NULL,
        content text NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_platform_assistant_messages_admin (admin_id, created_at)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_assistant_proposals (
        id varchar(36) NOT NULL,
        admin_id int NOT NULL,
        cabinet_id int NOT NULL,
        type varchar(40) NOT NULL,
        params json NOT NULL,
        title varchar(255) NOT NULL,
        summary text NOT NULL,
        target_version varchar(64) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        decided_at datetime NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_platform_assistant_proposals_admin (admin_id, status)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS platform_assistant_proposals');
    await queryRunner.query('DROP TABLE IF EXISTS platform_assistant_messages');
  }
}
