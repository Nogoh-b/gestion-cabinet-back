import { VersionProcedureTemplates1785169007000 } from './migrations/1785169007000-VersionProcedureTemplates';

describe('VersionProcedureTemplates1785169007000', () => {
  const queryRunner = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryRunner.query.mockResolvedValue([]);
  });

  it('normalise les anciens statuts via VARCHAR avant l’ENUM canonique', async () => {
    const migration = new VersionProcedureTemplates1785169007000();

    await migration.up(queryRunner as any);

    const statements = queryRunner.query.mock.calls.map(([sql]) =>
      String(sql).replace(/\s+/g, ' ').trim(),
    );
    const toVarchar = statements.findIndex((sql) =>
      sql.includes("MODIFY status VARCHAR(32) NOT NULL DEFAULT 'active'"),
    );
    const normalize = statements.findIndex((sql) =>
      sql.includes("WHEN LOWER(status) IN ('completed','closed')"),
    );
    const toCanonicalEnum = statements.findIndex((sql) =>
      sql.includes(
        "MODIFY status ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE'",
      ),
    );

    expect(toVarchar).toBeGreaterThanOrEqual(0);
    expect(normalize).toBeGreaterThan(toVarchar);
    expect(toCanonicalEnum).toBeGreaterThan(normalize);
    expect(statements.join('\n')).not.toMatch(
      /ENUM\([^)]*'active'[^)]*'ACTIVE'/,
    );
  });

  it('repasse également par VARCHAR lors du rollback', async () => {
    const migration = new VersionProcedureTemplates1785169007000();

    await migration.down(queryRunner as any);

    const statements = queryRunner.query.mock.calls
      .map(([sql]) => String(sql).replace(/\s+/g, ' ').trim())
      .join('\n');
    expect(statements).toContain(
      "MODIFY status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'",
    );
    expect(statements).not.toMatch(/ENUM\([^)]*'active'[^)]*'ACTIVE'/);
  });
});
