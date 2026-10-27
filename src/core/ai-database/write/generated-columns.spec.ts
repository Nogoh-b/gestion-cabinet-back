import { describe, expect, it, jest } from '@jest/globals';
import { fillRequiredGeneratedColumns } from './base-write-handler';

/** Dépôt minimal : colonnes, hooks @BeforeInsert et codes déjà pris. */
function repo(columns: any[], { taken = [] as string[], hook }: { taken?: string[]; hook?: (row: any) => void } = {}) {
  const metadata = {
    tableName: 'jurisdictions',
    columns: columns.map((c) => ({ propertyName: c.databaseName, type: 'varchar', isNullable: false, ...c })),
    beforeInsertListeners: hook ? [{ execute: async (row: any) => hook(row) }] : [],
    findColumnWithDatabaseName(name: string) {
      return this.columns.find((c: any) => c.databaseName === name);
    },
  };
  const remaining = [...taken];
  return {
    metadata,
    create: (fields: any) => ({ ...fields }),
    count: jest.fn(async ({ where }: any) => {
      const index = remaining.indexOf(where.code);
      if (index === -1) return 0;
      remaining.splice(index, 1);
      return 1;
    }),
  } as any;
}

const code = { databaseName: 'code', length: 50 };
const name = { databaseName: 'name' };

describe('fillRequiredGeneratedColumns', () => {
  it('génère le code obligatoire retiré du plan, comme la création manuelle', async () => {
    const out = await fillRequiredGeneratedColumns(repo([code, name]), { name: "Cour d'appel du Centre" });
    expect(out.code).toMatch(/^COUR_D_APPEL_[A-Z0-9]{4}$/);
  });

  it('tire un autre code s’il est déjà pris (corbeille comprise)', async () => {
    const target = repo([code, name]);
    target.count.mockResolvedValueOnce(1 as never);
    const out = await fillRequiredGeneratedColumns(target, { name: 'TPI Maroua' });
    expect(target.count).toHaveBeenCalledTimes(2);
    expect(target.count.mock.calls[0][0]).toMatchObject({ withDeleted: true });
    expect(out.code).toMatch(/^TPI_MAROUA_[A-Z0-9]{4}$/);
  });

  it('laisse un code fourni, facultatif, ou rempli par un hook', async () => {
    expect(await fillRequiredGeneratedColumns(repo([code, name]), { name: 'X', code: 'CA_CENTRE' })).toEqual({ name: 'X', code: 'CA_CENTRE' });
    expect(await fillRequiredGeneratedColumns(repo([{ ...code, isNullable: true }, name]), { name: 'X' })).toEqual({ name: 'X' });
    expect(
      await fillRequiredGeneratedColumns(repo([code, name], { hook: (row) => (row.code = 'HOOK-1') }), { name: 'X' }),
    ).toEqual({ name: 'X' });
  });

  it('préfixe tiré de la table quand rien ne nomme la ligne', async () => {
    const out = await fillRequiredGeneratedColumns(repo([code]), {});
    expect(out.code).toMatch(/^JUR_[A-Z0-9]{4}$/);
  });
});
