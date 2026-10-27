import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fusion visible « nom/prénom en un seul champ » (collaborateurs et clients).
 *
 * Étape « Expand » d'une migration en trois temps (expand → migrate →
 * contract) : `full_name` devient une colonne réelle sur `user` et
 * `customer`, backfillée depuis les colonnes existantes. `first_name` et
 * `last_name` NE SONT PAS supprimées : elles restent la source lue par
 * l'existant (recherche, tri, exports, module IA — plusieurs centaines
 * d'usages) et sont maintenues à jour automatiquement par les hooks
 * `syncNameFields()` des entités `User`/`Customer` à chaque création ou
 * mise à jour passant par `save()`.
 *
 * Idempotent : vérifie la présence de la colonne avant de l'ajouter (la base
 * de dev tourne en `synchronize:true` et a pu déjà matérialiser le schéma).
 */
export class AddFullNameColumn1790400000000 implements MigrationInterface {
  private async addFullNameColumn(
    queryRunner: QueryRunner,
    table: 'user' | 'customer',
  ): Promise<void> {
    const columns: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SHOW COLUMNS FROM \`${table}\` LIKE 'full_name'`,
    );
    if (columns.length > 0) return;

    await queryRunner.query(`
      ALTER TABLE \`${table}\`
        ADD COLUMN full_name VARCHAR(91) NULL AFTER first_name
    `);
    await queryRunner.query(`
      UPDATE \`${table}\`
         SET full_name = TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
       WHERE full_name IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`${table}\`
        MODIFY COLUMN full_name VARCHAR(91) NOT NULL
    `);
  }

  private async dropFullNameColumn(
    queryRunner: QueryRunner,
    table: 'user' | 'customer',
  ): Promise<void> {
    const columns: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SHOW COLUMNS FROM \`${table}\` LIKE 'full_name'`,
    );
    if (columns.length === 0) return;
    await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN full_name`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addFullNameColumn(queryRunner, 'user');
    await this.addFullNameColumn(queryRunner, 'customer');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropFullNameColumn(queryRunner, 'customer');
    await this.dropFullNameColumn(queryRunner, 'user');
  }
}
