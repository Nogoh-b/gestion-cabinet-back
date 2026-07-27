import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageReferences1782100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasReferences = await queryRunner.hasColumn('message', 'references');
    if (!hasReferences) {
      await queryRunner.query(`
        ALTER TABLE message
        ADD COLUMN \`references\` JSON NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasReferences = await queryRunner.hasColumn('message', 'references');
    if (hasReferences) {
      await queryRunner.query(`
        ALTER TABLE message
        DROP COLUMN \`references\`
      `);
    }
  }
}
