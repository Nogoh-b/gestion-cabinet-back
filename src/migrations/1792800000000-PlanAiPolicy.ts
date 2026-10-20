import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class PlanAiPolicy1792800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('plans', 'ai_policy'))) {
      await runner.addColumn(
        'plans',
        new TableColumn({ name: 'ai_policy', type: 'json', isNullable: true }),
      );
    }
  }
  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('plans', 'ai_policy'))
      await runner.dropColumn('plans', 'ai_policy');
  }
}
