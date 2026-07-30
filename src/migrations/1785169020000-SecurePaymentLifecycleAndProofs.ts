import { MigrationInterface, QueryRunner } from 'typeorm';

const PROOF_COLUMNS: Record<string, string> = {
  preuve_original_name: 'VARCHAR(255) NULL',
  preuve_mime_type: 'VARCHAR(120) NULL',
  preuve_size: 'BIGINT NULL',
  preuve_sha256: 'CHAR(64) NULL',
};

export class SecurePaymentLifecycleAndProofs1785169020000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE paiements
       MODIFY COLUMN status ENUM('0','1','2','3') NOT NULL DEFAULT '0'`,
    );
    for (const [column, definition] of Object.entries(PROOF_COLUMNS)) {
      if (!(await queryRunner.hasColumn('paiements', column))) {
        await queryRunner.query(
          `ALTER TABLE paiements ADD COLUMN \`${column}\` ${definition}`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of Object.keys(PROOF_COLUMNS).reverse()) {
      if (await queryRunner.hasColumn('paiements', column)) {
        await queryRunner.query(
          `ALTER TABLE paiements DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE paiements
       MODIFY COLUMN status ENUM('0','1','2','3') NOT NULL DEFAULT '1'`,
    );
  }
}
