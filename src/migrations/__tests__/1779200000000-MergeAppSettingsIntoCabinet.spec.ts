import { QueryRunner } from 'typeorm';
import { MergeAppSettingsIntoCabinet1779200000000 } from '../1779200000000-MergeAppSettingsIntoCabinet';

describe('MergeAppSettingsIntoCabinet1779200000000', () => {
  const createQueryRunner = (options: {
    hasLogoUrl: boolean;
    hasAppSettings?: boolean;
    appSettingsColumns?: string[];
  }) => {
    const query = jest.fn().mockResolvedValue(undefined);
    const hasColumn = jest
      .fn()
      .mockImplementation(async (_table: string, column: string) =>
        column === 'logo_url' ? options.hasLogoUrl : true,
      );
    const hasTable = jest
      .fn()
      .mockResolvedValue(options.hasAppSettings ?? false);
    const getTable = jest.fn().mockResolvedValue(
      options.hasAppSettings
        ? {
            columns: (
              options.appSettingsColumns ?? [
                'cabinet_id',
                'cabinet_name',
                'invoice_padding',
              ]
            ).map((name) => ({ name })),
          }
        : undefined,
    );

    return {
      query,
      hasColumn,
      hasTable,
      getTable,
      queryRunner: {
        query,
        hasColumn,
        hasTable,
        getTable,
      } as unknown as QueryRunner,
    };
  };

  it('creates logo_url before copying legacy settings when the column is absent', async () => {
    const runner = createQueryRunner({
      hasLogoUrl: false,
      hasAppSettings: true,
    });

    await new MergeAppSettingsIntoCabinet1779200000000().up(runner.queryRunner);

    const sqlStatements = runner.query.mock.calls.map(([sql]) => sql as string);
    const addLogoColumnIndex = sqlStatements.findIndex((sql) =>
      sql.includes('ADD COLUMN logo_url LONGTEXT NULL'),
    );
    const copySettingsIndex = sqlStatements.findIndex((sql) =>
      sql.includes('UPDATE cabinets c'),
    );

    expect(addLogoColumnIndex).toBeGreaterThanOrEqual(0);
    expect(copySettingsIndex).toBeGreaterThan(addLogoColumnIndex);
  });

  it('widens an existing logo_url column instead of adding it again', async () => {
    const runner = createQueryRunner({ hasLogoUrl: true });

    await new MergeAppSettingsIntoCabinet1779200000000().up(runner.queryRunner);

    expect(runner.query).toHaveBeenCalledWith(
      'ALTER TABLE cabinets MODIFY logo_url LONGTEXT NULL',
    );
    expect(runner.query).not.toHaveBeenCalledWith(
      'ALTER TABLE cabinets ADD COLUMN logo_url LONGTEXT NULL',
    );
  });

  it('copies only columns available in a historical app_settings schema', async () => {
    const runner = createQueryRunner({
      hasLogoUrl: true,
      hasAppSettings: true,
      appSettingsColumns: [
        'cabinet_id',
        'cabinet_name',
        'invoice_prefix',
      ],
    });

    await new MergeAppSettingsIntoCabinet1779200000000().up(runner.queryRunner);

    const copyQuery = runner.query.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes('UPDATE cabinets c'));

    expect(copyQuery).toContain('a.cabinet_name');
    expect(copyQuery).toContain('a.invoice_prefix');
    expect(copyQuery).not.toContain('a.invoice_padding');
    expect(copyQuery).not.toContain('a.invoice_numbering_strategy');
  });
});
