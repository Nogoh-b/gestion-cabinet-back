import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMigrationChanel1748602705037 implements MigrationInterface {
  // Insère les canaux par défaut
  public async up(query_runner: QueryRunner): Promise<void> {
    await query_runner.query(`
      INSERT INTO channels_transaction (name, code)
      VALUES
        ('Guichet', 'BRANCH'),
        ('Mobile Banking', 'MOBILE'),
        ('Distributeur Automatique de Billets', 'ATM'),
        ('API Integration', 'API');
    `);
  }

  // Supprime les canaux insérés
  public async down(query_runner: QueryRunner): Promise<void> {
    await query_runner.query(`
      DELETE FROM channels_transaction
      WHERE code IN ('BRANCH', 'MOBILE', 'ATM', 'API')
    `);
  }
}
