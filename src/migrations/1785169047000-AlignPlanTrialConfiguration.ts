import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignPlanTrialConfiguration1785169047000
  implements MigrationInterface
{
  name = 'AlignPlanTrialConfiguration1785169047000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('plans', 'trial_enabled'))) {
      await queryRunner.query(
        'ALTER TABLE plans ADD COLUMN trial_enabled TINYINT(1) NOT NULL DEFAULT 0',
      );
      await queryRunner.query(`
        UPDATE plans
        SET trial_enabled =
          CASE WHEN code IN ('starter', 'avocat', 'cabinet') THEN 1 ELSE 0 END
      `);
    }

    if (!(await queryRunner.hasColumn('plans', 'trial_days'))) {
      await queryRunner.query(
        'ALTER TABLE plans ADD COLUMN trial_days INT NOT NULL DEFAULT 30',
      );
      await queryRunner.query(`
        UPDATE plans
        SET trial_days =
          CASE
            WHEN code IN ('starter', 'avocat') THEN 14
            WHEN code = 'cabinet' THEN 30
            ELSE 0
          END
      `);
    }

    if (!(await queryRunner.hasColumn('plans', 'min_commitment_months'))) {
      await queryRunner.query(
        'ALTER TABLE plans ADD COLUMN min_commitment_months INT NOT NULL DEFAULT 0',
      );
      await queryRunner.query(`
        UPDATE plans
        SET min_commitment_months =
          CASE WHEN code IN ('starter', 'avocat', 'cabinet') THEN 12 ELSE 0 END
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'min_commitment_months',
      'trial_days',
      'trial_enabled',
    ]) {
      if (await queryRunner.hasColumn('plans', column)) {
        await queryRunner.query(`ALTER TABLE plans DROP COLUMN \`${column}\``);
      }
    }
  }
}
