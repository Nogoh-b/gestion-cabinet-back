import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureExpenseReportLifecycle1785169028000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      ['approved_at', 'ADD COLUMN approved_at DATETIME(6) NULL'],
      ['rejected_at', 'ADD COLUMN rejected_at DATETIME(6) NULL'],
      ['rejection_reason', 'ADD COLUMN rejection_reason TEXT NULL'],
      [
        'reimbursement_method',
        `ADD COLUMN reimbursement_method
         ENUM('ESPECES','CHEQUE','VIREMENT','CARTE_BANCAIRE','PRELEVEMENT','MOBILE_MONEY')
         NULL`,
      ],
      [
        'reimbursement_reference',
        'ADD COLUMN reimbursement_reference VARCHAR(255) NULL',
      ],
      ['reimbursed_by_id', 'ADD COLUMN reimbursed_by_id INT NULL'],
    ] as const;
    for (const [column, sql] of additions) {
      if (!(await queryRunner.hasColumn('expense_report', column))) {
        await queryRunner.query(`ALTER TABLE expense_report ${sql}`);
      }
    }
    await queryRunner.query(
      `ALTER TABLE expense_report
       MODIFY COLUMN total_amount DECIMAL(18,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE expense_line
       MODIFY COLUMN amount_ht DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN amount_ttc DECIMAL(18,2) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'reimbursed_by_id',
      'reimbursement_reference',
      'reimbursement_method',
      'rejection_reason',
      'rejected_at',
      'approved_at',
    ]) {
      if (await queryRunner.hasColumn('expense_report', column)) {
        await queryRunner.query(
          `ALTER TABLE expense_report DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE expense_report
       MODIFY COLUMN total_amount DECIMAL(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE expense_line
       MODIFY COLUMN amount_ht DECIMAL(10,2) NOT NULL,
       MODIFY COLUMN amount_ttc DECIMAL(10,2) NOT NULL`,
    );
  }
}
