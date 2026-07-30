import { MigrationCertificationWorkflow1785169044000 } from './migrations/1785169044000-MigrationCertificationWorkflow';

describe('MigrationCertificationWorkflow1785169044000', () => {
  const queryRunner = {
    hasTable: jest.fn(),
    hasColumn: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryRunner.hasTable.mockResolvedValue(true);
    queryRunner.hasColumn.mockResolvedValue(false);
    queryRunner.query.mockResolvedValue([]);
  });

  it('ajoute un workflow de résolution à toutes les reprises sensibles', async () => {
    const migration =
      new MigrationCertificationWorkflow1785169044000();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'ALTER TABLE dossier_lifecycle_migration_audit',
    );
    expect(sql).toContain(
      'ALTER TABLE supplier_evidence_migration_issues',
    );
    expect(sql).toContain(
      'ALTER TABLE referral_commission_migration_issues',
    );
    expect(sql).toContain(
      'ALTER TABLE chat_attachment_migration_report',
    );
    expect(sql).toContain("resolution_status = 'RESOLVED'");
  });

  it('reste rejouable quand les colonnes existent déjà', async () => {
    queryRunner.hasColumn.mockResolvedValue(true);
    const migration =
      new MigrationCertificationWorkflow1785169044000();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).not.toContain('ADD COLUMN');
    expect(sql).toContain(
      'UPDATE dossier_lifecycle_migration_audit',
    );
  });
});
