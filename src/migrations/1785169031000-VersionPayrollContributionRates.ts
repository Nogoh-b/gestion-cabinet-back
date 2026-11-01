import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class VersionPayrollContributionRates1785169031000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      ['version', 'ADD COLUMN version INT NULL'],
      [
        'status',
        `ADD COLUMN status
         ENUM('draft','published','retired') NULL`,
      ],
      ['valid_from', 'ADD COLUMN valid_from DATE NULL'],
      ['valid_until', 'ADD COLUMN valid_until DATE NULL'],
      [
        'published_at',
        'ADD COLUMN published_at DATETIME(6) NULL',
      ],
      ['published_by_id', 'ADD COLUMN published_by_id INT NULL'],
      ['retired_at', 'ADD COLUMN retired_at DATETIME(6) NULL'],
      ['retired_by_id', 'ADD COLUMN retired_by_id INT NULL'],
      [
        'retirement_reason',
        'ADD COLUMN retirement_reason TEXT NULL',
      ],
    ] as const;
    for (const [column, definition] of additions) {
      if (
        !(await queryRunner.hasColumn(
          'payroll_contribution',
          column,
        ))
      ) {
        await queryRunner.query(
          `ALTER TABLE payroll_contribution ${definition}`,
        );
      }
    }

    await queryRunner.query(
      `CREATE TEMPORARY TABLE payroll_contribution_versions AS
       SELECT
         id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, code
           ORDER BY id
         ) AS calculated_version,
         MAX(CASE WHEN is_active = 1 THEN id ELSE NULL END) OVER (
           PARTITION BY tenant_id, code
         ) AS latest_active_id
       FROM payroll_contribution`,
    );
    await queryRunner.query(
      `UPDATE payroll_contribution contribution
       JOIN payroll_contribution_versions versioned
         ON versioned.id = contribution.id
       SET contribution.version = versioned.calculated_version,
           contribution.status =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN 'published'
               ELSE 'retired'
             END,
           contribution.valid_from = '1970-01-01',
           contribution.valid_until =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN NULL
               ELSE UTC_DATE()
             END,
           contribution.published_at =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN UTC_TIMESTAMP(6)
               ELSE NULL
             END,
           contribution.retired_at =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN NULL
               ELSE UTC_TIMESTAMP(6)
             END,
           contribution.retirement_reason =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN NULL
               ELSE 'Version historique reprise lors de la migration'
             END,
           contribution.is_active =
             CASE
               WHEN contribution.id = versioned.latest_active_id
                 THEN 1
               ELSE 0
             END`,
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE payroll_contribution_versions',
    );
    await queryRunner.query(
      `ALTER TABLE payroll_contribution
       MODIFY COLUMN version INT NOT NULL DEFAULT 1,
       MODIFY COLUMN status
         ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
       MODIFY COLUMN valid_from DATE NOT NULL,
       MODIFY COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE`,
    );

    const duplicates = await queryRunner.query(
      `SELECT tenant_id, code, version, COUNT(*) AS duplicate_count
       FROM payroll_contribution
       GROUP BY tenant_id, code, version
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (duplicates.length) {
      throw new Error(
        'Migration interrompue : versions de barème dupliquées',
      );
    }
    const table = await queryRunner.getTable('payroll_contribution');
    if (
      table &&
      !table.indices.some(
        (index) =>
          index.name ===
          'UQ_payroll_contribution_tenant_code_version',
      )
    ) {
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: 'UQ_payroll_contribution_tenant_code_version',
          columnNames: ['tenant_id', 'code', 'version'],
          isUnique: true,
        }),
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'payslip',
        'contribution_snapshot',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE payslip
         ADD COLUMN contribution_snapshot JSON NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn('payslip', 'contribution_snapshot')
    ) {
      await queryRunner.query(
        'ALTER TABLE payslip DROP COLUMN contribution_snapshot',
      );
    }
    const table = await queryRunner.getTable('payroll_contribution');
    const index = table?.indices.find(
      (candidate) =>
        candidate.name ===
        'UQ_payroll_contribution_tenant_code_version',
    );
    if (index) {
      await queryRunner.dropIndex('payroll_contribution', index);
    }
    for (const column of [
      'retirement_reason',
      'retired_by_id',
      'retired_at',
      'published_by_id',
      'published_at',
      'valid_until',
      'valid_from',
      'status',
      'version',
    ]) {
      if (
        await queryRunner.hasColumn(
          'payroll_contribution',
          column,
        )
      ) {
        await queryRunner.query(
          `ALTER TABLE payroll_contribution
           DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
