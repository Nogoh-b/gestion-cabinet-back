import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versions des documents classés : un document modifié (fichier remplacé à
 * la main ou depuis le studio du chat) garde son id et archive ici son
 * fichier précédent, au lieu d'écraser le fichier ou de créer un doublon.
 */
export class DocumentCustomerVersions1793100000000 implements MigrationInterface {
  name = 'DocumentCustomerVersions1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS document_customer_versions (
         id INT NOT NULL AUTO_INCREMENT,
         tenant_id INT NOT NULL DEFAULT 1,
         document_id INT NOT NULL,
         version INT NOT NULL,
         name VARCHAR(255) NOT NULL,
         file_path VARCHAR(1024) NULL,
         file_url VARCHAR(1024) NULL,
         file_size INT NULL,
         file_mimetype VARCHAR(255) NULL,
         source VARCHAR(20) NOT NULL DEFAULT 'upload',
         comment TEXT NULL,
         created_by_id INT NULL,
         created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
         deleted_at DATETIME(6) NULL,
         PRIMARY KEY (id),
         INDEX IDX_document_customer_versions_document (tenant_id, document_id),
         INDEX IDX_document_customer_versions_tenant (tenant_id),
         CONSTRAINT FK_document_customer_versions_document FOREIGN KEY (document_id)
           REFERENCES document_customer (id) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS document_customer_versions');
  }
}
