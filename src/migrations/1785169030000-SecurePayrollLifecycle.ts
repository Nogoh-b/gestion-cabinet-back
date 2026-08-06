import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class SecurePayrollLifecycle1785169030000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(
      `SELECT tenant_id, employee_id, period_id, COUNT(*) AS duplicate_count
       FROM payslip
       GROUP BY tenant_id, employee_id, period_id
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        'Migration interrompue : plusieurs bulletins actifs existent pour un collaborateur et une période',
      );
    }

    const payslipColumns = [
      ['prepared_by_id', 'ADD COLUMN prepared_by_id INT NULL'],
      ['validated_by_id', 'ADD COLUMN validated_by_id INT NULL'],
      [
        'validated_at',
        'ADD COLUMN validated_at DATETIME(6) NULL',
      ],
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
    ] as const;
    for (const [column, definition] of payslipColumns) {
      if (!(await queryRunner.hasColumn('payslip', column))) {
        await queryRunner.query(
          `ALTER TABLE payslip ${definition}`,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE payslip
       MODIFY COLUMN gross_amount DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN net_amount DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN total_employer_charges DECIMAL(18,2) NULL,
       MODIFY COLUMN payment_date DATETIME(6) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE payslip_line
       MODIFY COLUMN amount DECIMAL(18,2) NOT NULL`,
    );

    const periodColumns = [
      ['closed_at', 'ADD COLUMN closed_at DATETIME(6) NULL'],
      ['closed_by_id', 'ADD COLUMN closed_by_id INT NULL'],
      ['paid_at', 'ADD COLUMN paid_at DATETIME(6) NULL'],
      ['paid_by_id', 'ADD COLUMN paid_by_id INT NULL'],
    ] as const;
    for (const [column, definition] of periodColumns) {
      if (!(await queryRunner.hasColumn('payroll_period', column))) {
        await queryRunner.query(
          `ALTER TABLE payroll_period ${definition}`,
        );
      }
    }

    const table = await queryRunner.getTable('payslip');
    if (
      table &&
      !table.indices.some(
        (index) =>
          index.name === 'UQ_payslip_tenant_employee_period',
      )
    ) {
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: 'UQ_payslip_tenant_employee_period',
          columnNames: ['tenant_id', 'employee_id', 'period_id'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('payslip');
    const index = table?.indices.find(
      (candidate) =>
        candidate.name === 'UQ_payslip_tenant_employee_period',
    );
    if (index) await queryRunner.dropIndex('payslip', index);

    for (const column of [
      'paid_by_id',
      'paid_at',
      'closed_by_id',
      'closed_at',
    ]) {
      if (await queryRunner.hasColumn('payroll_period', column)) {
        await queryRunner.query(
          `ALTER TABLE payroll_period DROP COLUMN \`${column}\``,
        );
      }
    }
    for (const column of [
      'payment_reference',
      'payment_method',
      'paid_by_id',
      'validated_at',
      'validated_by_id',
      'prepared_by_id',
    ]) {
      if (await queryRunner.hasColumn('payslip', column)) {
        await queryRunner.query(
          `ALTER TABLE payslip DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
