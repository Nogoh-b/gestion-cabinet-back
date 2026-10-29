import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Documents : visionneuse, édition interne, notes.
 *
 *  - `document_customer_notes` : fil de notes d'un document (auteur, version
 *    du document au moment de la note) ;
 *  - `document_customer.origin` : internal (rédigé ou modifié dans l'éditeur
 *    du cabinet) | imported (fichier déposé), rempli d'après
 *    `metadata.source` / `metadata.version_source` ;
 *  - `content_html` (document et versions) : source HTML de l'éditeur, pour
 *    rééditer sans perte ;
 *  - `document_customer.updated_by_id` : auteur de la dernière modification.
 *
 * Idempotent (gardes `hasColumn` / `IF NOT EXISTS`) car la base de dev
 * tourne en `synchronize:true`.
 */
export class DocumentNotesAndOrigin1793800000000 implements MigrationInterface {
  name = 'DocumentNotesAndOrigin1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS document_customer_notes (
         id INT NOT NULL AUTO_INCREMENT,
         tenant_id INT NOT NULL DEFAULT 1,
         document_id INT NOT NULL,
         content TEXT NOT NULL,
         author_id INT NULL,
         version INT NOT NULL DEFAULT 1,
         created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
         deleted_at DATETIME(6) NULL,
         PRIMARY KEY (id),
         INDEX IDX_document_customer_notes_document (tenant_id, document_id),
         INDEX IDX_document_customer_notes_tenant (tenant_id),
         CONSTRAINT FK_document_customer_notes_document FOREIGN KEY (document_id)
           REFERENCES document_customer (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    );

    if (!(await queryRunner.hasColumn('document_customer', 'origin'))) {
      await queryRunner.query(`
        ALTER TABLE \`document_customer\`
        ADD \`origin\` ENUM('internal', 'imported') NOT NULL DEFAULT 'imported'
      `);
    }
    // Toujours rejoué (idempotent) : en développement, `synchronize` peut
    // avoir créé la colonne avec la valeur par défaut avant la migration.
    await queryRunner.query(`
      UPDATE \`document_customer\`
      SET \`origin\` = 'internal'
      WHERE \`origin\` = 'imported'
        AND (\`metadata\` LIKE '%"source":"ai_studio"%'
          OR \`metadata\` LIKE '%"version_source":"ai_studio"%'
          OR \`metadata\` LIKE '%"version_source":"editor"%')
    `);

    if (!(await queryRunner.hasColumn('document_customer', 'content_html'))) {
      await queryRunner.addColumn(
        'document_customer',
        new TableColumn({ name: 'content_html', type: 'longtext', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('document_customer', 'updated_by_id'))) {
      await queryRunner.addColumn(
        'document_customer',
        new TableColumn({ name: 'updated_by_id', type: 'int', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('document_customer_versions', 'content_html'))) {
      await queryRunner.addColumn(
        'document_customer_versions',
        new TableColumn({ name: 'content_html', type: 'longtext', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('document_customer_versions', 'content_html')) {
      await queryRunner.dropColumn('document_customer_versions', 'content_html');
    }
    for (const column of ['updated_by_id', 'content_html', 'origin']) {
      if (await queryRunner.hasColumn('document_customer', column)) {
        await queryRunner.dropColumn('document_customer', column);
      }
    }
    await queryRunner.query('DROP TABLE IF EXISTS document_customer_notes');
  }
}
