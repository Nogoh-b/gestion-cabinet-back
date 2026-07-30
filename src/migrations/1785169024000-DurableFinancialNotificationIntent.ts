import { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableFinancialNotificationIntent1785169024000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('factures', 'notify_client_requested'))) {
      await queryRunner.query(
        `ALTER TABLE factures
         ADD COLUMN notify_client_requested TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
    if (!(await queryRunner.hasColumn('paiements', 'notify_client_requested'))) {
      await queryRunner.query(
        `ALTER TABLE paiements
         ADD COLUMN notify_client_requested TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('paiements', 'notify_client_requested')) {
      await queryRunner.query(
        `ALTER TABLE paiements DROP COLUMN notify_client_requested`,
      );
    }
    if (await queryRunner.hasColumn('factures', 'notify_client_requested')) {
      await queryRunner.query(
        `ALTER TABLE factures DROP COLUMN notify_client_requested`,
      );
    }
  }
}
