import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropDossierArchivedFlag1785169006000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('dossiers', 'is_archived')) {
      await queryRunner.query(`ALTER TABLE dossiers DROP COLUMN is_archived`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('dossiers', 'is_archived'))) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `UPDATE dossiers SET is_archived = (status = 'ARCHIVED')`,
      );
    }
  }
}
