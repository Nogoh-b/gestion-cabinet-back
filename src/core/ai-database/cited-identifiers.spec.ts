/// <reference types="jest" />
import { In } from 'typeorm';
import { AiDatabaseService } from './ai-database.service';
import { ConversationManagerService } from './conversation-manager.service';

/** Table simulée : colonnes TypeORM minimales + lignes du cabinet. */
function table(tableName: string, columns: Record<string, unknown>, rows: any[]) {
  return {
    tableName,
    primaryColumns: [{ databaseName: 'id' }],
    columns: Object.entries(columns).map(([name, type]) => ({ databaseName: name, propertyName: name, type })),
    target: tableName,
    rows,
  };
}

function build() {
  const tables = [
    table('factures', { id: 'int', numero: String, montant_ttc: 'decimal' }, [
      { id: 141, numero: 'FAC-2026-0041' },
      { id: 144, numero: 'FAC-2026-0044' },
      // Même numéro deux fois : jamais cité (pas de choix au hasard).
      { id: 150, numero: 'FAC-2026-0050' },
      { id: 151, numero: 'FAC-2026-0050' },
    ]),
    table('dossiers', { id: 'int', dossier_number: 'varchar' }, [{ id: 90, dossier_number: 'DOS-2026-0038' }]),
    table('customer', { id: 'int', full_name: 'varchar', customer_code: 'varchar' }, [{ id: 7, full_name: 'Émilie Lefèvre' }]),
  ];
  const find = jest.fn(async ({ where }: { where: Array<Record<string, any>> }, name: string) => {
    const rows = tables.find((t) => t.tableName === name)!.rows;
    return rows.filter((row) =>
      where.some((clause) =>
        Object.entries(clause).every(([column, op]) => {
          const values: string[] = (op as ReturnType<typeof In>).value as any;
          // Collation MySQL : casse et accents ignorés.
          const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          return values.some((v) => norm(v) === norm(row[column]));
        }),
      ),
    );
  });
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { log: jest.fn(), warn: jest.fn() };
  service.dataSource = {
    entityMetadatas: tables,
    getRepository: (target: string) => ({ find: (options: any) => find(options, target) }),
  };
  const manager: any = Object.create(ConversationManagerService.prototype);
  manager.citations = new (require('node:async_hooks').AsyncLocalStorage)();
  service.conversationManager = manager;
  return { service, manager, find };
}

describe('Références par numéro métier (requêtes agrégées)', () => {
  it('cite les factures, le dossier et le client nommés dans le résultat, par leur identifiant', async () => {
    const { service, manager } = build();
    const sql =
      'SELECT f.numero, SUM(p.montant) AS encaisse, d.dossier_number, c.full_name AS client_nom FROM factures f ' +
      'JOIN dossiers d ON d.id = f.dossier_id JOIN customer c ON c.id = d.client_id LEFT JOIN paiements p ON p.facture_id = f.id GROUP BY f.id';
    const rows = [
      { numero: 'FAC-2026-0041', encaisse: '0.00', dossier_number: 'DOS-2026-0038', client_nom: 'Émilie LEFÈVRE' },
      { numero: 'FAC-2026-0044', encaisse: '5000.00', dossier_number: 'DOS-2026-0038', client_nom: 'Émilie LEFÈVRE' },
      { numero: 'FAC-2026-0050', encaisse: '0.00', dossier_number: 'DOS-2026-0038', client_nom: 'Émilie LEFÈVRE' },
    ];
    const cited = await manager.withCitations(async () => {
      await service.citeIdentifiedRecords(sql, rows);
      return manager.citedRecords();
    });
    expect(cited).toEqual([
      { type: 'facture', entity: 'factures', id: 141, label: 'FAC-2026-0041', href: '/facturation/factures/141' },
      { type: 'facture', entity: 'factures', id: 144, label: 'FAC-2026-0044', href: '/facturation/factures/144' },
      { type: 'dossier', entity: 'dossiers', id: 90, label: 'DOS-2026-0038', href: '/dossiers/90' },
      { type: 'client', entity: 'customer', id: 7, label: 'Émilie LEFÈVRE', href: '/clients/7' },
    ]);
  });

  it('ne cherche rien hors d’une réponse du chat', async () => {
    const { service, find } = build();
    await service.citeIdentifiedRecords('SELECT numero FROM factures', [{ numero: 'FAC-2026-0041' }]);
    expect(find).not.toHaveBeenCalled();
  });
});
