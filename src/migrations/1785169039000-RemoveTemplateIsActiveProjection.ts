import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le cycle DRAFT/PUBLISHED/RETIRED devient l'unique état persistant du template.
 * L'ancien booléen isActive pouvait contredire lifecycle_status.
 */
export class RemoveTemplateIsActiveProjection1785169039000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('procedure_templates', 'isActive')) {
      await queryRunner.query(`
        UPDATE procedure_templates
        SET
          lifecycle_status = CASE
            WHEN lifecycle_status = 'DRAFT' THEN 'DRAFT'
            WHEN isActive = 1 THEN 'PUBLISHED'
            ELSE 'RETIRED'
          END,
          published_at = CASE
            WHEN lifecycle_status = 'PUBLISHED' OR isActive = 1
              THEN COALESCE(published_at, updated_at, created_at, UTC_TIMESTAMP())
            ELSE published_at
          END,
          retired_at = CASE
            WHEN lifecycle_status = 'RETIRED' OR
                 (lifecycle_status <> 'DRAFT' AND isActive = 0)
              THEN COALESCE(retired_at, updated_at, UTC_TIMESTAMP())
            ELSE NULL
          END
      `);
      await queryRunner.query(
        'ALTER TABLE procedure_templates DROP COLUMN isActive',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('procedure_templates', 'isActive'))) {
      await queryRunner.query(
        'ALTER TABLE procedure_templates ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 0',
      );
      await queryRunner.query(`
        UPDATE procedure_templates
        SET isActive = CASE
          WHEN lifecycle_status = 'PUBLISHED' THEN 1
          ELSE 0
        END
      `);
    }
  }
}
