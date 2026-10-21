import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pièces jointes des e-mails : TEXT (64 Ko) → LONGTEXT. Le composer envoie
 * les pièces en base64 : au-delà de 64 Ko la liste était tronquée et le mail
 * ne se relisait plus (« Unterminated string in JSON at position 65535 »).
 */
export class MailAttachmentsLongtext1792900000000 implements MigrationInterface {
  name = 'MailAttachmentsLongtext1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mails MODIFY attachments LONGTEXT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mails MODIFY attachments TEXT NULL`);
  }
}
