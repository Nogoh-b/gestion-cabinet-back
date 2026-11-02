import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class SecurePayrollLifecycle1785169030000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.archiveDuplicatePayslips(queryRunner);

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

  /**
   * Plusieurs bulletins pour un même (cabinet, collaborateur, période) bloquent
   * l'index unique. On garde le plus avancé (payé > validé > brouillon, puis
   * celui qui a des lignes, puis le plus récent) et on déplace les autres, avec
   * leurs lignes, dans des tables d'archive : rien n'est perdu, tout reste
   * restaurable à la main.
   */
  private async archiveDuplicatePayslips(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows: Array<{
      id: number;
      tenant_id: number;
      employee_id: number;
      period_id: number;
      status: string;
      line_count: number;
    }> = await queryRunner.query(
      `SELECT p.id, p.tenant_id, p.employee_id, p.period_id, p.status,
              (SELECT COUNT(*) FROM payslip_line l WHERE l.payslip_id = p.id)
                AS line_count
         FROM payslip p
         JOIN (SELECT tenant_id, employee_id, period_id FROM payslip
                GROUP BY tenant_id, employee_id, period_id
               HAVING COUNT(*) > 1) d
           ON d.tenant_id = p.tenant_id AND d.employee_id = p.employee_id
          AND d.period_id = p.period_id`,
    );
    if (rows.length === 0) return;

    const rank: Record<string, number> = { paid: 2, validated: 1, draft: 0 };
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.tenant_id}:${row.employee_id}:${row.period_id}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const losers: number[] = [];
    for (const group of groups.values()) {
      group.sort(
        (a, b) =>
          (rank[b.status] ?? 0) - (rank[a.status] ?? 0) ||
          Number(b.line_count > 0) - Number(a.line_count > 0) ||
          b.id - a.id,
      );
      losers.push(...group.slice(1).map((row) => row.id));
    }

    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS payslip_duplicate_archive LIKE payslip',
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS payslip_line_duplicate_archive LIKE payslip_line',
    );
    const ids = losers.join(', ');
    await queryRunner.query(
      `INSERT IGNORE INTO payslip_duplicate_archive
       SELECT * FROM payslip WHERE id IN (${ids})`,
    );
    await queryRunner.query(
      `INSERT IGNORE INTO payslip_line_duplicate_archive
       SELECT * FROM payslip_line WHERE payslip_id IN (${ids})`,
    );
    await queryRunner.query(
      `DELETE FROM payslip_line WHERE payslip_id IN (${ids})`,
    );
    await queryRunner.query(`DELETE FROM payslip WHERE id IN (${ids})`);
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
