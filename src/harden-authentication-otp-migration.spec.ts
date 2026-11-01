import { HardenAuthenticationOtp1785169016000 } from './migrations/1785169016000-HardenAuthenticationOtp';

describe('HardenAuthenticationOtp1785169016000', () => {
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

  it('crée la table finale lorsque le schéma historique ne la contient pas', async () => {
    queryRunner.hasTable.mockResolvedValue(false);
    const migration = new HardenAuthenticationOtp1785169016000();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('CREATE TABLE auth_tokens');
    expect(sql).toContain('failed_attempts INT NOT NULL DEFAULT 0');
    expect(sql).toContain('KEY idx_auth_token_rate (email, type, createdAt)');
    expect(sql).not.toContain('ALTER TABLE auth_tokens');
  });

  it('durcit une table historique existante de façon rejouable', async () => {
    const migration = new HardenAuthenticationOtp1785169016000();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ADD COLUMN failed_attempts');
    expect(sql).toContain('ADD COLUMN last_attempt_at');
    expect(sql).toContain('ADD KEY idx_auth_token_rate');

    jest.clearAllMocks();
    queryRunner.hasTable.mockResolvedValue(true);
    queryRunner.hasColumn.mockResolvedValue(true);
    queryRunner.query.mockResolvedValue([{ Key_name: 'idx_auth_token_rate' }]);

    await migration.up(queryRunner as any);

    expect(
      queryRunner.query.mock.calls.some(([statement]) =>
        String(statement).includes('ALTER TABLE'),
      ),
    ).toBe(false);
  });
});
