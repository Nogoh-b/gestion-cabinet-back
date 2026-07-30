import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retire les dernières projections procédurales éditables du dossier.
 *
 * Les dates de procédure proviennent désormais des audiences et délais, et les
 * prochaines étapes de l'instance du template. Les anciennes valeurs restent
 * disponibles uniquement pour le rapprochement historique.
 */
export class RemoveDossierProceduralProjections1785169038000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_procedure_legacy_audit (
        dossier_id INT NOT NULL,
        tenant_id INT NULL,
        legacy_data JSON NOT NULL,
        migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dossier_id)
      ) ENGINE=InnoDB
    `);

    const hasKeyDates = await queryRunner.hasColumn('dossiers', 'key_dates');
    const hasNextSteps = await queryRunner.hasColumn('dossiers', 'next_steps');

    if (hasKeyDates || hasNextSteps) {
      const keyDatesExpression = hasKeyDates ? 'd.key_dates' : 'NULL';
      const nextStepsExpression = hasNextSteps ? 'd.next_steps' : 'NULL';

      await queryRunner.query(`
        INSERT IGNORE INTO dossier_procedure_legacy_audit
          (dossier_id, tenant_id, legacy_data)
        SELECT d.id, d.tenant_id, JSON_OBJECT(
          'key_dates', ${keyDatesExpression},
          'next_steps', ${nextStepsExpression}
        )
        FROM dossiers d
      `);

      await queryRunner.query(`
        UPDATE dossier_procedure_legacy_audit a
        INNER JOIN dossiers d ON d.id = a.dossier_id
        SET a.legacy_data = JSON_MERGE_PATCH(
          a.legacy_data,
          JSON_OBJECT(
            'key_dates', ${keyDatesExpression},
            'next_steps', ${nextStepsExpression}
          )
        )
      `);
    }

    if (hasKeyDates) {
      await queryRunner.query('ALTER TABLE dossiers DROP COLUMN key_dates');
    }
    if (hasNextSteps) {
      await queryRunner.query('ALTER TABLE dossiers DROP COLUMN next_steps');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('dossiers', 'key_dates'))) {
      await queryRunner.query(
        'ALTER TABLE dossiers ADD COLUMN key_dates JSON NULL',
      );
    }
    if (!(await queryRunner.hasColumn('dossiers', 'next_steps'))) {
      await queryRunner.query(
        'ALTER TABLE dossiers ADD COLUMN next_steps TEXT NULL',
      );
    }

    await queryRunner.query(`
      UPDATE dossiers d
      INNER JOIN dossier_procedure_legacy_audit a ON a.dossier_id = d.id
      SET
        d.key_dates = JSON_EXTRACT(a.legacy_data, '$.key_dates'),
        d.next_steps = NULLIF(
          JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.next_steps')),
          'null'
        )
    `);
  }
}
