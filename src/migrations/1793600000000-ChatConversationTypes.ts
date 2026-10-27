import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { CONVERSATION_TYPE_BACKFILL } from '../modules/chat/conversation-type.backfill';

/**
 * Chat : classement des conversations et membres de droit des dossiers.
 *
 *  - `conversation.type` : global | dossier | direct | group, rempli d'après
 *    l'existant (lien depuis `dossiers.conversation_id`, nom du groupe du
 *    cabinet, `isGroup`) ;
 *  - `dossiers.created_by_id` : auteur du dossier, membre de son chat
 *    (inconnu pour les dossiers existants) ;
 *  - `attachment.uploaded_by_id` : seul l'auteur d'un téléversement peut le
 *    joindre à un message.
 */
export class ChatConversationTypes1793600000000 implements MigrationInterface {
  name = 'ChatConversationTypes1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('conversation', 'type'))) {
      await queryRunner.query(`
        ALTER TABLE \`conversation\`
        ADD \`type\` ENUM('global', 'dossier', 'direct', 'group') NOT NULL DEFAULT 'group'
      `);
    }
    // Toujours rejoué (idempotent) : en développement, `synchronize` peut
    // avoir créé la colonne avec la valeur par défaut avant la migration.
    for (const sql of CONVERSATION_TYPE_BACKFILL) {
      await queryRunner.query(sql);
    }

    if (!(await queryRunner.hasColumn('dossiers', 'created_by_id'))) {
      await queryRunner.addColumn(
        'dossiers',
        new TableColumn({ name: 'created_by_id', type: 'int', isNullable: true }),
      );
    }

    if (!(await queryRunner.hasColumn('attachment', 'uploaded_by_id'))) {
      await queryRunner.addColumn(
        'attachment',
        new TableColumn({ name: 'uploaded_by_id', type: 'int', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('attachment', 'uploaded_by_id')) {
      await queryRunner.dropColumn('attachment', 'uploaded_by_id');
    }
    if (await queryRunner.hasColumn('dossiers', 'created_by_id')) {
      await queryRunner.dropColumn('dossiers', 'created_by_id');
    }
    if (await queryRunner.hasColumn('conversation', 'type')) {
      await queryRunner.dropColumn('conversation', 'type');
    }
  }
}
