import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class CompleteCaseWorkflowPlanning1782700001000
  implements MigrationInterface
{
  name = 'CompleteCaseWorkflowPlanning1782700001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('dossier_actions', 'remind_at'))) {
      await queryRunner.addColumn(
        'dossier_actions',
        new TableColumn({
          name: 'remind_at',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('dossier_actions', 'reminder_sent_at'))) {
      await queryRunner.addColumn(
        'dossier_actions',
        new TableColumn({
          name: 'reminder_sent_at',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
    const table = await queryRunner.getTable('dossier_actions');
    if (
      table &&
      !table.indices.some(
        (index) => index.name === 'IDX_dossier_action_reminders',
      )
    ) {
      await queryRunner.createIndex(
        'dossier_actions',
        new TableIndex({
          name: 'IDX_dossier_action_reminders',
          columnNames: ['tenant_id', 'status', 'remind_at', 'reminder_sent_at'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('dossier_actions');
    if (
      table?.indices.some(
        (index) => index.name === 'IDX_dossier_action_reminders',
      )
    ) {
      await queryRunner.dropIndex(
        'dossier_actions',
        'IDX_dossier_action_reminders',
      );
    }
    if (await queryRunner.hasColumn('dossier_actions', 'reminder_sent_at')) {
      await queryRunner.dropColumn('dossier_actions', 'reminder_sent_at');
    }
    if (await queryRunner.hasColumn('dossier_actions', 'remind_at')) {
      await queryRunner.dropColumn('dossier_actions', 'remind_at');
    }
  }
}
