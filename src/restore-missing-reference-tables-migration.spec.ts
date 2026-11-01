import { RestoreMissingReferenceTables1785169033500 } from './migrations/1785169033500-RestoreMissingReferenceTables';

describe('RestoreMissingReferenceTables1785169033500', () => {
  it('reconstruit toutes les tables historiquement créées par synchronize', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue([]),
    };
    const migration = new RestoreMissingReferenceTables1785169033500();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    for (const table of [
      'plans',
      'cabinets',
      'country',
      'region',
      'division',
      'districts',
      'location_city',
      'otp_codes',
      'otp_online_link',
      'type_customer_document_type',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql.indexOf('CREATE TABLE IF NOT EXISTS plans')).toBeLessThan(
      sql.indexOf('CREATE TABLE IF NOT EXISTS cabinets'),
    );
    expect(sql).toContain('FOREIGN KEY (plan_id) REFERENCES plans(id)');
  });
});
