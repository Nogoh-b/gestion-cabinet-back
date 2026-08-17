import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les colonnes d'essai configurable a `plans` :
 * `trial_enabled`, `trial_days`, `min_commitment_months`.
 *
 * Ces colonnes existent dans l'entite Plan (plan.entity.ts) mais n'avaient
 * jamais ete capturees dans une migration - probablement materialisees en
 * dev via `synchronize:true` et jamais reportees en prod.
 *
 * Idempotent : verifie la presence de chaque colonne avant de l'ajouter.
 */
export class AddTrialFieldsToPlans1782400000000 implements MigrationInterface {
  private async columnExists(queryRunner: QueryRunner, column: string): Promise<boolean> {
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'plans'
         AND COLUMN_NAME = ?`,
      [column],
    );
    return cols.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.columnExists(queryRunner, 'trial_enabled'))) {
      await queryRunner.query(
        `ALTER TABLE plans ADD COLUMN trial_enabled TINYINT NOT NULL DEFAULT 0 AFTER is_active`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'trial_days'))) {
      await queryRunner.query(
        `ALTER TABLE plans ADD COLUMN trial_days INT NOT NULL DEFAULT 30 AFTER trial_enabled`,
      );
    }
    if (!(await this.columnExists(queryRunner, 'min_commitment_months'))) {
      await queryRunner.query(
        `ALTER TABLE plans ADD COLUMN min_commitment_months INT NOT NULL DEFAULT 0 AFTER trial_days`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.columnExists(queryRunner, 'min_commitment_months')) {
      await queryRunner.query(`ALTER TABLE plans DROP COLUMN min_commitment_months`);
    }
    if (await this.columnExists(queryRunner, 'trial_days')) {
      await queryRunner.query(`ALTER TABLE plans DROP COLUMN trial_days`);
    }
    if (await this.columnExists(queryRunner, 'trial_enabled')) {
      await queryRunner.query(`ALTER TABLE plans DROP COLUMN trial_enabled`);
    }
  }
}
