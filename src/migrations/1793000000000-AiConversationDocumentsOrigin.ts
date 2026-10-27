import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documents de la conversation du chat IA : ceux que le chat a rédigés
 * (courrier, e-mail, WhatsApp, traduction, document du studio) sont gardés
 * comme les pièces jointes lues, pour être relus aux questions suivantes
 * (`origin = 'generated'`). `content_html` garde la mise en forme d'origine
 * (Word lu, document rédigé) pour la traduction et l'éditeur.
 */
export class AiConversationDocumentsOrigin1793000000000 implements MigrationInterface {
  name = 'AiConversationDocumentsOrigin1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ai_conversation_documents
         ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'upload' AFTER message_id,
         ADD COLUMN content_html LONGTEXT NULL AFTER display_content`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM ai_conversation_documents WHERE origin = 'generated'`);
    await queryRunner.query(
      `ALTER TABLE ai_conversation_documents DROP COLUMN content_html, DROP COLUMN origin`,
    );
  }
}
