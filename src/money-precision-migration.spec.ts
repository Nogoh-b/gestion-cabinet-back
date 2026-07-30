import { AddValidatedInvoiceStatusAndMoneyPrecision1785169021000 } from './migrations/1785169021000-AddValidatedInvoiceStatusAndMoneyPrecision';

describe('AddValidatedInvoiceStatusAndMoneyPrecision1785169021000', () => {
  const queryRunner = {
    hasTable: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryRunner.hasTable.mockResolvedValue(true);
    queryRunner.query.mockResolvedValue([]);
  });

  it('crée les lignes comptables absentes avec la précision finale', async () => {
    queryRunner.hasTable.mockResolvedValue(false);
    const migration =
      new AddValidatedInvoiceStatusAndMoneyPrecision1785169021000();

    await migration.up(queryRunner as any);

    const statements = queryRunner.query.mock.calls
      .map(([statement]) => String(statement).replace(/\s+/g, ' ').trim())
      .join('\n');
    expect(statements).toContain('CREATE TABLE lignes_ecriture_comptable');
    expect(statements).toContain('debit DECIMAL(18,2)');
    expect(statements).toContain(
      'FOREIGN KEY (ecriture_id) REFERENCES ecritures_comptables(id)',
    );
  });

  it('augmente la précision sur une table de lignes existante', async () => {
    const migration =
      new AddValidatedInvoiceStatusAndMoneyPrecision1785169021000();

    await migration.up(queryRunner as any);

    const statements = queryRunner.query.mock.calls
      .map(([statement]) => String(statement).replace(/\s+/g, ' ').trim())
      .join('\n');
    expect(statements).toContain(
      'ALTER TABLE lignes_ecriture_comptable MODIFY COLUMN debit DECIMAL(18,2)',
    );
    expect(statements).not.toContain('CREATE TABLE lignes_ecriture_comptable');
  });
});
