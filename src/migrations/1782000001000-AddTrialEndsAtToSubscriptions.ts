import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute `trial_ends_at` à `subscriptions`.
 *
 * Borne la portion d'essai gratuite, désormais distincte de la période payante :
 * tant que `now < trial_ends_at`, l'abonnement est en essai ; une fois dépassée,
 * il bascule en période payante dont le décompte vise `ends_at`.
 *
 * Idempotent : la base de dev tourne en `synchronize:true` et a pu déjà créer
 * la colonne. On vérifie sa présence avant de l'ajouter.
 */
export class AddTrialEndsAtToSubscriptions1782000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscriptions'
         AND COLUMN_NAME = 'trial_ends_at'`,
    );
    if (!cols.length) {
      await queryRunner.query(
        `ALTER TABLE subscriptions ADD COLUMN trial_ends_at DATETIME NULL AFTER ends_at`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscriptions'
         AND COLUMN_NAME = 'trial_ends_at'`,
    );
    if (cols.length) {
      await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN trial_ends_at`);
    }
  }
}
