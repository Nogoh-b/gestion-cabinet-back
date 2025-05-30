import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedProviders1748613517894 implements MigrationInterface {
 public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO provider (code, name, status, created_at, updated_at)
      VALUES 
        ('CASH', 'Espèces', 1, NOW(), NOW()),
        ('CHEQUE', 'Chèque', 1, NOW(), NOW()),
        ('SYSTEM', 'Système', 1, NOW(), NOW()),
        ('E_WALLET', 'Porte-monnaie électronique', 1, NOW(), NOW());
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM provider 
      WHERE code IN ('CASH', 'CHEQUE', 'SYSTEM', 'E_WALLET');
    `);
  }
}
