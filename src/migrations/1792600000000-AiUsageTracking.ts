import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consommation des modèles IA : une ligne par appel (`ai_request_calls`) avec
 * les tokens renvoyés par le fournisseur et le coût au tarif du moment.
 * `request_log_id` relie l'appel à la question du chat (`ai_request_log`) ;
 * il est vide pour les appels hors question (confirmation, plateforme).
 * tenant_id 0 = plateforme. Pas de clé étrangère : purger le journal des
 * requêtes ne doit pas effacer l'historique des coûts.
 */
export class AiUsageTracking1792600000000 implements MigrationInterface {
  name = 'AiUsageTracking1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ai_request_calls (
         id INT NOT NULL AUTO_INCREMENT,
         request_log_id INT NULL,
         tenant_id INT NOT NULL DEFAULT 0,
         provider VARCHAR(64) NOT NULL,
         model VARCHAR(128) NOT NULL,
         profile VARCHAR(16) NULL,
         input_tokens INT NOT NULL DEFAULT 0,
         output_tokens INT NOT NULL DEFAULT 0,
         cached_input_tokens INT NOT NULL DEFAULT 0,
         reasoning_tokens INT NOT NULL DEFAULT 0,
         estimated TINYINT(1) NOT NULL DEFAULT 0,
         cost_usd DECIMAL(14,8) NULL,
         created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         PRIMARY KEY (id),
         INDEX IDX_ai_request_calls_tenant_date (tenant_id, created_at),
         INDEX IDX_ai_request_calls_date (created_at),
         INDEX IDX_ai_request_calls_request (request_log_id),
         INDEX IDX_ai_request_calls_model (provider, model)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    );
    // Statistiques de la plateforme : période sur tous les cabinets.
    const indexes: Array<{ Key_name: string }> = await queryRunner.query(
      "SHOW INDEX FROM ai_request_log WHERE Key_name = 'IDX_ai_request_log_date'",
    );
    if (!indexes.length) {
      await queryRunner.query('CREATE INDEX IDX_ai_request_log_date ON ai_request_log (created_at)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes: Array<{ Key_name: string }> = await queryRunner.query(
      "SHOW INDEX FROM ai_request_log WHERE Key_name = 'IDX_ai_request_log_date'",
    );
    if (indexes.length) {
      await queryRunner.query('DROP INDEX IDX_ai_request_log_date ON ai_request_log');
    }
    await queryRunner.query('DROP TABLE IF EXISTS ai_request_calls');
  }
}
