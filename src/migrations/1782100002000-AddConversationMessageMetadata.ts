import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationMessageMetadata1782100002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasMetadata = await queryRunner.hasColumn('conversation_messages', 'metadata');
    if (!hasMetadata) {
      await queryRunner.query(`
        ALTER TABLE conversation_messages
        ADD COLUMN \`metadata\` JSON NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasMetadata = await queryRunner.hasColumn('conversation_messages', 'metadata');
    if (hasMetadata) {
      await queryRunner.query(`
        ALTER TABLE conversation_messages
        DROP COLUMN \`metadata\`
      `);
    }
  }
}
