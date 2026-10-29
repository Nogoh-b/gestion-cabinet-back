import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

/**
 * Export des dossiers : `dossier_exports` enregistre chaque ZIP conservé dans
 * `uploads/exports/<tenant>/` pour le lister, le télécharger, le supprimer et
 * le compter dans l'espace de stockage du cabinet.
 */
export class DossierExports1794300000000 implements MigrationInterface {
  name = 'DossierExports1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('dossier_exports'))) {
      await queryRunner.createTable(
        new Table({
          name: 'dossier_exports',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'tenant_id', type: 'int', default: 1 },
            { name: 'created_by', type: 'int', isNullable: true },
            { name: 'dossier_ids', type: 'json' },
            { name: 'file_name', type: 'varchar', length: '255' },
            { name: 'file_path', type: 'varchar', length: '500' },
            { name: 'file_size', type: 'bigint', default: 0 },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updated_at',
              type: 'datetime',
              precision: 6,
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            { name: 'deleted_at', type: 'datetime', precision: 6, isNullable: true },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'dossier_exports',
        new TableIndex({
          name: 'IDX_dossier_exports_tenant_user',
          columnNames: ['tenant_id', 'created_by'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dossier_exports', true);
  }
}
