import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Chat : transcription des vocaux.
 *
 *  - `attachment.transcript` : texte transcrit d'une pièce audio ;
 *  - `attachment.transcript_status` : pending | processing | done | empty |
 *    failed (null : pas de transcription prévue).
 */
export class ChatAttachmentTranscript1793950000000 implements MigrationInterface {
  name = 'ChatAttachmentTranscript1793950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('attachment', 'transcript'))) {
      await queryRunner.addColumn(
        'attachment',
        new TableColumn({ name: 'transcript', type: 'text', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('attachment', 'transcript_status'))) {
      await queryRunner.query(`
        ALTER TABLE \`attachment\`
        ADD \`transcript_status\` ENUM('pending', 'processing', 'done', 'empty', 'failed') NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('attachment', 'transcript_status')) {
      await queryRunner.dropColumn('attachment', 'transcript_status');
    }
    if (await queryRunner.hasColumn('attachment', 'transcript')) {
      await queryRunner.dropColumn('attachment', 'transcript');
    }
  }
}
