import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationMessageReferences1782100001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasReferences = await queryRunner.hasColumn('conversation_messages', 'references');
    if (!hasReferences) {
      await queryRunner.query(`
        ALTER TABLE conversation_messages
        ADD COLUMN \`references\` JSON NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasReferences = await queryRunner.hasColumn('conversation_messages', 'references');
    if (hasReferences) {
      await queryRunner.query(`
        ALTER TABLE conversation_messages
        DROP COLUMN \`references\`
      `);
    }
  }
}
