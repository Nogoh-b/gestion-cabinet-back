import { MigrationInterface, QueryRunner } from 'typeorm';

type SchemaCollationRow = {
  DEFAULT_CHARACTER_SET_NAME: string;
  DEFAULT_COLLATION_NAME: string;
};

type CollationAuditRow = {
  source_character_set: string;
  source_collation: string;
};

const TARGET_CHARACTER_SET = 'utf8mb4';
const TARGET_COLLATION = 'utf8mb4_general_ci';

function safeIdentifier(value: unknown, label: string): string {
  const identifier = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`${label} invalide`);
  }
  return identifier;
}

export class AlignMySqlDatabaseCollation1785168999000
  implements MigrationInterface
{
  name = 'AlignMySqlDatabaseCollation1785168999000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const database = safeIdentifier(
      queryRunner.connection.options.database,
      'Nom de base MySQL',
    );
    const rows: SchemaCollationRow[] = await queryRunner.query(
      `SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
         FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME = DATABASE()
        LIMIT 1`,
    );
    const schema = rows[0];
    if (!schema) {
      throw new Error('Métadonnées de collation MySQL introuvables');
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS schema_collation_migration_audit (
        id TINYINT UNSIGNED NOT NULL,
        source_character_set VARCHAR(64) NOT NULL,
        source_collation VARCHAR(64) NOT NULL,
        target_character_set VARCHAR(64) NOT NULL,
        target_collation VARCHAR(64) NOT NULL,
        migrated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(
      `INSERT INTO schema_collation_migration_audit (
         id,
         source_character_set,
         source_collation,
         target_character_set,
         target_collation
       ) VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        schema.DEFAULT_CHARACTER_SET_NAME,
        schema.DEFAULT_COLLATION_NAME,
        TARGET_CHARACTER_SET,
        TARGET_COLLATION,
      ],
    );

    await queryRunner.query(
      `ALTER DATABASE \`${database}\`
         CHARACTER SET ${TARGET_CHARACTER_SET}
         COLLATE ${TARGET_COLLATION}`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const database = safeIdentifier(
      queryRunner.connection.options.database,
      'Nom de base MySQL',
    );
    const rows: CollationAuditRow[] = await queryRunner.query(
      `SELECT source_character_set, source_collation
         FROM schema_collation_migration_audit
        WHERE id = 1
        LIMIT 1`,
    );
    const source = rows[0];
    if (source) {
      const characterSet = safeIdentifier(
        source.source_character_set,
        'Jeu de caractères source',
      );
      const collation = safeIdentifier(
        source.source_collation,
        'Collation source',
      );
      await queryRunner.query(
        `ALTER DATABASE \`${database}\`
           CHARACTER SET ${characterSet}
           COLLATE ${collation}`,
      );
    }
    await queryRunner.query(
      'DROP TABLE IF EXISTS schema_collation_migration_audit',
    );
  }
}
