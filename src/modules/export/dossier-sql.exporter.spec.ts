/// <reference types="jest" />
import { DataSource } from 'typeorm';
import { hiddenResponseFields } from 'src/core/security/restricted-fields';
import { DossierSqlExporter, type DossierSqlScope, sqlLiteral } from './dossier-sql.exporter';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Step } from '../dossiers/entities/step.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentCustomerVersion } from '../documents/document-customer/entities/document-customer-version.entity';
import { DocumentCustomerNote } from '../documents/document-customer/entities/document-customer-note.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
  InvoiceLine,
} from '../case-workflow/entities/billing.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../case-workflow/entities/dossier-action.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';

/**
 * Lit les INSERT produits comme le ferait MariaDB : chaînes entre quotes avec
 * échappements `\x`, `NULL`, `DEFAULT`, nombres, `X'..'`. Une valeur mal
 * échappée décale les colonnes et fait échouer le test.
 */
function parseInserts(sql: string) {
  const statements: { ignore: boolean; table: string; columns: string[]; rows: unknown[][] }[] = [];
  const re = /^(INSERT(?: IGNORE)?) INTO `([^`]+)` \(([^)]*)\) VALUES\n/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const columns = match[3].split(', ').map((c) => c.replace(/^`|`$/g, ''));
    let i = re.lastIndex;
    const rows: unknown[][] = [];
    const unescape: Record<string, string> = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a' };
    for (;;) {
      if (sql[i] !== '(') throw new Error(`"(" attendu en ${i} : ${sql.slice(i, i + 40)}`);
      i++;
      const row: unknown[] = [];
      for (;;) {
        if (sql[i] === "'") {
          let value = '';
          i++;
          while (sql[i] !== "'") {
            if (sql[i] === '\\') {
              i++;
              value += unescape[sql[i]] ?? sql[i];
            } else value += sql[i];
            i++;
          }
          i++;
          row.push(value);
        } else {
          const end = sql.slice(i).search(/[,)]/);
          const token = sql.slice(i, i + end).trim();
          i += end;
          row.push(
            token === 'NULL'
              ? null
              : token === 'DEFAULT'
                ? 'DEFAULT'
                : /^X'/.test(token)
                  ? Buffer.from(token.slice(2, -1), 'hex')
                  : Number(token),
          );
        }
        if (sql[i] === ',') {
          i += 2; // ", "
          continue;
        }
        if (sql[i] === ')') break;
        throw new Error(`Valeur mal terminée en ${i} : ${sql.slice(i - 20, i + 20)}`);
      }
      i++;
      expect(row).toHaveLength(columns.length);
      rows.push(row);
      if (sql.startsWith(',\n', i)) {
        i += 2;
        continue;
      }
      if (sql[i] === ';') break;
      throw new Error(`";" attendu en ${i}`);
    }
    statements.push({ ignore: match[1] === 'INSERT IGNORE', table: match[2], columns, rows });
  }
  return statements;
}

/** Ligne d'un INSERT, colonne → valeur. */
function rowsOf(sql: string, table: string) {
  return parseInserts(sql)
    .filter((s) => s.table === table)
    .flatMap((s) => s.rows.map((r) => Object.fromEntries(s.columns.map((c, i) => [c, r[i]]))));
}

/** Métadonnées minimales d'une table, sur le modèle d'EntityMetadata. */
function meta(
  tableName: string,
  opts: {
    tenant?: boolean;
    softDelete?: boolean;
    columns?: Record<string, { type?: string; isNullable?: boolean; generatedType?: string }>;
    junctions?: [table: string, ownerColumn: string][];
  } = {},
) {
  const columns = Object.entries({
    id: { isNullable: false },
    ...(opts.tenant === false ? {} : { tenant_id: { isNullable: false } }),
    ...(opts.softDelete === false ? {} : { deleted_at: {} }),
    ...opts.columns,
  }).map(([databaseName, c]) => ({ databaseName, isNullable: true, ...c }));
  const findColumnWithDatabaseName = (name: string) =>
    columns.find((c) => c.databaseName === name);
  return {
    tableName,
    columns,
    findColumnWithDatabaseName,
    primaryColumns: [columns[0]],
    deleteDateColumn: findColumnWithDatabaseName('deleted_at'),
    manyToManyRelations: (opts.junctions ?? []).map(([table, owner]) => ({
      isOwning: true,
      junctionEntityMetadata: {
        ...meta(table, { tenant: false, softDelete: false }),
        ownerColumns: [{ databaseName: owner, referencedColumn: { databaseName: 'id' } }],
      },
    })),
  };
}

const METADATA = new Map<unknown, ReturnType<typeof meta>>([
  [Dossier, meta('dossiers', { columns: { opening_date: { type: 'date' }, client_id: { isNullable: false } } })],
  [Step, meta('step', { junctions: [['step_documents', 'step_id']] })],
  [DocumentCustomer, meta('document_customer')],
  [DocumentCustomerVersion, meta('document_customer_versions')],
  [DocumentCustomerNote, meta('document_customer_notes')],
  [Audience, meta('audiences', { junctions: [['audience_documents', 'audience_id'], ['audience_report_documents', 'audience_id']] })],
  [Diligence, meta('diligences', { junctions: [['diligence_documents', 'diligence_id']] })],
  [Facture, meta('factures')],
  [InvoiceLine, meta('invoice_lines')],
  [Paiement, meta('paiements')],
  [DossierBillingProfile, meta('dossier_billing_profiles')],
  [DossierBillingRule, meta('dossier_billing_rules')],
  [BillableItem, meta('billable_items', { columns: { professional_action_key: { generatedType: 'STORED' } } })],
  [DossierAction, meta('dossier_actions')],
  [DossierActionDocumentLink, meta('dossier_action_document_links')],
  [DossierActionAudienceLink, meta('dossier_action_audience_links')],
  [DossierActionRelation, meta('dossier_action_relations')],
  [Customer, meta('customer')],
  [User, meta('user', { columns: { password: {} } })],
  [Employee, meta('employee', { columns: { salary: { isNullable: false, type: 'decimal' } } })],
  [Jurisdiction, meta('jurisdictions')],
  [ProcedureType, meta('procedure_types')],
]);

describe('DossierSqlExporter', () => {
  let db: DataSource;
  let tables: Record<string, Record<string, unknown>[]>;
  const queries: string[] = [];

  beforeAll(() => {
    // Base en mémoire : interprète les seuls SELECT émis par l'exporteur.
    db = {
      getMetadata: (entity: unknown) => {
        const m = METADATA.get(entity);
        if (!m) throw new Error(`Métadonnées absentes : ${(entity as any)?.name}`);
        return m;
      },
    } as any;
    (db as any).query = jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      const m = /^SELECT \* FROM `([^`]+)` WHERE `([^`]+)` IN \(\?\)( AND `tenant_id` IN \(\?\))?/.exec(sql);
      if (!m) throw new Error(`Requête inattendue : ${sql}`);
      const [, table, column, tenant] = m;
      const [values, tenants] = params as unknown[][];
      return (tables[table] ?? []).filter(
        (row) =>
          values.map(String).includes(String(row[column])) &&
          (!tenant || tenants.map(Number).includes(Number(row.tenant_id))) &&
          (!/deleted_at` IS NULL/.test(sql) || row.deleted_at == null),
      );
    });
  });

  beforeEach(() => {
    queries.length = 0;
    const tricky = "Plaidoirie d'O'Neil \\ chemin C:\\dossiers\n2e ligne -- ; DROP TABLE x; /*";
    tables = {
      dossiers: [
        { id: 7, tenant_id: 5, dossier_number: 'DOS-7', object: tricky, client_id: 83, lawyer_id: 31, jurisdiction_id: 4, procedure_type_id: 2, procedure_subtype_id: null, budget_estimate: '500000.00', opening_date: new Date(2026, 0, 15), deleted_at: null },
      ],
      step: [{ id: 70, tenant_id: 5, dossier_id: 7, title: 'Ouverture', metadata: '{"a":1}' }],
      document_customer: [
        { id: 700, tenant_id: 5, dossier_id: 7, name: 'Assignation.pdf', deleted_at: null },
        { id: 701, tenant_id: 5, dossier_id: 7, name: 'Supprimé', deleted_at: new Date() },
      ],
      document_customer_versions: [{ id: 1, tenant_id: 5, document_id: 700, version: 1 }],
      audiences: [{ id: 71, tenant_id: 5, dossier_id: 7, jurisdiction_id: 9, report_content: tricky, decision_text: 'Renvoi', created_at: new Date(2026, 1, 3, 9, 30, 0) }],
      audience_documents: [{ audience_id: 71, document_id: 700 }],
      diligences: [{ id: 72, tenant_id: 5, dossier_id: 7, assigned_lawyer_id: 31 }],
      factures: [
        { id: 'f1', tenant_id: 5, dossier_id: 7, client_id: 83, numero: 'F-1', montant_ttc: '60000.00' },
        // Même dossier_id, autre cabinet : ne doit jamais sortir.
        { id: 'fx', tenant_id: 6, dossier_id: 7, client_id: 99, numero: 'X-1' },
      ],
      invoice_lines: [{ id: 'l1', tenant_id: 5, facture_id: 'f1', dossier_id: 7, source_snapshot: { from: 'action', n: 1 } }],
      paiements: [
        { id: 'p1', tenant_id: 5, facture_id: 'f1', montant: '25000.00', status: 1 },
        { id: 'px', tenant_id: 6, facture_id: 'f1', montant: '1.00', status: 1 },
      ],
      dossier_billing_profiles: [{ id: 'bp', tenant_id: 5, dossier_id: 7, hourly_rate: '40000.00' }],
      billable_items: [{ id: 'b1', tenant_id: 5, dossier_id: 7, client_id: 83, professional_action_key: 'k', label: 'Signature' }],
      dossier_actions: [{ id: 'a1', tenant_id: 5, dossier_id: 7, title: 'Signer' }],
      dossier_action_document_links: [{ id: 'dl', tenant_id: 5, action_id: 'a1', document_id: 700 }],
      customer: [
        { id: 83, tenant_id: 5, full_name: 'Client A', private_key: 'secret-priv', public_key: 'secret-pub' },
        { id: 99, tenant_id: 6, full_name: 'Client autre cabinet' },
      ],
      user: [{ id: 31, tenant_id: 5, full_name: 'Me Ndi', password: '$2b$10$hash', refreshToken: 'rt' }],
      employee: [{ id: 31, tenant_id: 5, salary: '900000.00', hourly_rate: '40000.00', home_address: 'Chez lui' }],
      jurisdictions: [
        { id: 4, tenant_id: 1, name: 'TGI Yaoundé' },
        { id: 9, tenant_id: 5, name: 'Cour d’appel' },
      ],
      procedure_types: [{ id: 2, tenant_id: 1, name: 'Recouvrement' }],
    };
  });

  const scope = (over: Partial<DossierSqlScope> = {}): DossierSqlScope => ({
    tenantId: 5,
    dossierIds: [7],
    include: { invoices: true, billing: true, actions: true },
    hidden: hiddenResponseFields({ role: 'admin' }),
    label: 'DOS-7',
    ...over,
  });

  it('writes a re-importable script framed by FOREIGN_KEY_CHECKS', async () => {
    const sql = await new DossierSqlExporter(db).export(scope());

    expect(sql).toMatch(/^-- Export SQL du dossier DOS-7/);
    expect(sql.indexOf('SET FOREIGN_KEY_CHECKS=0;')).toBeLessThan(sql.indexOf('INSERT'));
    expect(sql.trimEnd()).toMatch(/COMMIT;\nSET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;\nSET SQL_MODE=@OLD_SQL_MODE;$/);
    // Chaque instruction se relit, colonnes et valeurs alignées.
    const statements = parseInserts(sql);
    expect(statements.map((s) => s.table)).toEqual(
      expect.arrayContaining([
        'dossiers', 'step', 'document_customer', 'document_customer_versions', 'audiences',
        'audience_documents', 'diligences', 'factures', 'invoice_lines', 'paiements',
        'dossier_billing_profiles', 'billable_items', 'dossier_actions',
        'dossier_action_document_links', 'customer', 'user', 'employee', 'jurisdictions', 'procedure_types',
      ]),
    );
    // Valeurs piégeuses relues à l'identique.
    expect(rowsOf(sql, 'dossiers')[0].object).toBe(tables.dossiers[0].object);
    expect(rowsOf(sql, 'audiences')[0].report_content).toBe(tables.audiences[0].report_content);
    expect(rowsOf(sql, 'dossiers')[0].opening_date).toBe('2026-01-15');
    expect(rowsOf(sql, 'audiences')[0].created_at).toBe('2026-02-03 09:30:00.000');
    expect(JSON.parse(rowsOf(sql, 'invoice_lines')[0].source_snapshot as string)).toEqual({ from: 'action', n: 1 });
  });

  it('only exports rows of the dossier tenant', async () => {
    const sql = await new DossierSqlExporter(db).export(scope());

    expect(rowsOf(sql, 'factures').map((r) => r.id)).toEqual(['f1']);
    expect(rowsOf(sql, 'paiements').map((r) => r.id)).toEqual(['p1']);
    expect(rowsOf(sql, 'customer').map((r) => r.id)).toEqual([83]);
    expect(sql).not.toContain('autre cabinet');
    expect(sql).not.toContain('X-1');
    // Référentiels : globaux (tenant 1) et propres au cabinet.
    expect(rowsOf(sql, 'jurisdictions').map((r) => r.id).sort()).toEqual([4, 9]);
    // Chaque SELECT d'une table à tenant_id porte le filtre ; les tables de
    // jointure (sans tenant) sont filtrées par leurs propriétaires.
    const withTenant = queries.filter((q) => {
      const table = /FROM `([^`]+)`/.exec(q)![1];
      const m = [...METADATA.values()].find((x) => x.tableName === table);
      return !!m?.findColumnWithDatabaseName('tenant_id');
    });
    expect(withTenant.length).toBeGreaterThan(15);
    withTenant.forEach((q) => expect(q).toContain('`tenant_id` IN (?)'));
    // Lignes supprimées (soft delete) exclues.
    expect(rowsOf(sql, 'document_customer').map((r) => r.id)).toEqual([700]);
  });

  it('uses INSERT IGNORE for reference rows only', async () => {
    const statements = parseInserts(await new DossierSqlExporter(db).export(scope()));
    const ignored = (table: string) => statements.find((s) => s.table === table)!.ignore;

    for (const table of ['customer', 'user', 'employee', 'jurisdictions', 'procedure_types']) {
      expect(ignored(table)).toBe(true);
    }
    for (const table of ['dossiers', 'factures', 'paiements', 'dossier_actions', 'audiences']) {
      expect(ignored(table)).toBe(false);
    }
  });

  it('never exports secrets nor generated columns', async () => {
    const sql = await new DossierSqlExporter(db).export(scope());

    expect(sql).not.toMatch(/secret-priv|secret-pub|\$2b\$10|Chez lui/);
    expect(rowsOf(sql, 'user')[0].password).toBeNull();
    expect(rowsOf(sql, 'customer')[0].private_key).toBeNull();
    expect(rowsOf(sql, 'billable_items')[0]).not.toHaveProperty('professional_action_key');
  });

  it('leaves invoices, actions and restricted columns out for a lawyer', async () => {
    const lawyer = { role: 'avocat', permissions: ['view_dossiers', 'view_billable_items'] };
    const sql = await new DossierSqlExporter(db).export(
      scope({
        include: { invoices: false, billing: true, actions: false },
        hidden: hiddenResponseFields(lawyer),
      }),
    );
    const tablesOut = parseInserts(sql).map((s) => s.table);

    expect(tablesOut).not.toEqual(expect.arrayContaining(['factures']));
    expect(tablesOut).not.toContain('paiements');
    expect(tablesOut).not.toContain('invoice_lines');
    expect(tablesOut).not.toContain('dossier_actions');
    expect(tablesOut).toContain('billable_items');
    expect(rowsOf(sql, 'dossiers')[0].budget_estimate).toBeNull();
    // Colonne NOT NULL sans défaut : zéro neutre plutôt qu'un INSERT refusé.
    expect(rowsOf(sql, 'employee')[0].salary).toBe(0);
    // Taux horaire visible avec le droit facturation.
    expect(rowsOf(sql, 'employee')[0].hourly_rate).toBe('40000.00');
  });

  it('escapes every literal through mysql2', () => {
    expect(sqlLiteral("l'avocat \\ ")).toBe("'l\\'avocat \\\\ '");
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(true)).toBe('1');
    expect(sqlLiteral(Buffer.from('ab'))).toBe("X'6162'");
    expect(sqlLiteral({ a: "b'c" })).toBe(`'{\\"a\\":\\"b\\'c\\"}'`);
    expect(sqlLiteral(new Date('x'))).toBe('NULL');
  });
});
