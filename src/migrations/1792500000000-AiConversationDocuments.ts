import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Texte lu des pièces jointes du chat IA, gardé avec la conversation
 * (`ai_conversation_documents`) : les questions de suivi le retrouvent après
 * un rechargement, et les longs documents ne sont plus coupés à la lecture.
 */
export class AiConversationDocuments1792500000000 implements MigrationInterface {
  name = 'AiConversationDocuments1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ai_conversation_documents (
         id INT NOT NULL AUTO_INCREMENT,
         tenant_id INT NOT NULL DEFAULT 1,
         conversation_id VARCHAR(36) NOT NULL,
         message_id INT NULL,
         name VARCHAR(255) NOT NULL,
         type VARCHAR(120) NULL,
         size INT NULL,
         method VARCHAR(32) NULL,
         confidence FLOAT NULL,
         pages INT NULL,
         illegible FLOAT NULL,
         content LONGTEXT NOT NULL,
         display_content LONGTEXT NULL,
         created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
         deleted_at DATETIME(6) NULL,
         PRIMARY KEY (id),
         INDEX IDX_ai_conversation_documents_conversation (tenant_id, conversation_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ai_conversation_documents');
  }
}
