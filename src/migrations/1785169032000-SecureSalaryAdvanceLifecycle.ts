import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureSalaryAdvanceLifecycle1785169032000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      ['requested_by_id', 'ADD COLUMN requested_by_id INT NULL'],
      ['approved_by_id', 'ADD COLUMN approved_by_id INT NULL'],
      ['approved_at', 'ADD COLUMN approved_at DATETIME(6) NULL'],
      ['paid_by_id', 'ADD COLUMN paid_by_id INT NULL'],
      [
        'payment_method',
        `ADD COLUMN payment_method
         ENUM('bank_transfer','cash','mobile_money','check','other')
         NULL`,
      ],
      [
        'payment_reference',
        'ADD COLUMN payment_reference VARCHAR(100) NULL',
      ],
      ['cancelled_by_id', 'ADD COLUMN cancelled_by_id INT NULL'],
      [
        'cancelled_at',
        'ADD COLUMN cancelled_at DATETIME(6) NULL',
      ],
      [
        'cancellation_reason',
        'ADD COLUMN cancellation_reason TEXT NULL',
      ],
    ] as const;
    for (const [column, definition] of additions) {
      if (!(await queryRunner.hasColumn('salary_advance', column))) {
        await queryRunner.query(
          `ALTER TABLE salary_advance ${definition}`,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE salary_advance
       MODIFY COLUMN amount DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN recovered_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
       MODIFY COLUMN payment_date DATETIME(6) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'cancellation_reason',
      'cancelled_at',
      'cancelled_by_id',
      'payment_reference',
      'payment_method',
      'paid_by_id',
      'approved_at',
      'approved_by_id',
      'requested_by_id',
    ]) {
      if (await queryRunner.hasColumn('salary_advance', column)) {
        await queryRunner.query(
          `ALTER TABLE salary_advance DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
