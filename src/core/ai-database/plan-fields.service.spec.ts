import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { SharedAcrossTenants } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.context';
import { GenericWriteService } from './generic-write.service';
import { PlanFieldsService } from './plan-fields.service';

// ── Fausses métadonnées TypeORM ─────────────────────────────────────────────

@SharedAcrossTenants()
class TypeCustomer {}
class Customer {}
class ProcedureType {}
class Dossier {}

function column(databaseName: string, extra: Record<string, any> = {}) {
  return { databaseName, propertyName: databaseName, type: 'varchar', isNullable: true, ...extra };
}

function meta(tableName: string, target: Function, columns: any[]) {
  return {
    tableName,
    target,
    columns,
    relations: [] as any[],
    primaryColumns: [{ propertyName: 'id' }],
    findColumnWithDatabaseName: (name: string) => columns.find((c) => c.databaseName === name),
    findColumnWithPropertyName: (name: string) => columns.find((c) => c.propertyName === name),
  };
}

function relation(owner: any, propertyName: string, fkColumn: string, inverse: any, isNullable = true) {
  owner.columns.push(column(fkColumn, { type: 'int', propertyName }));
  owner.relations.push({ relationType: 'many-to-one', propertyName, isNullable, inverseEntityMetadata: inverse, joinColumns: [{ databaseName: fkColumn, referencedColumn: { propertyName: 'id' } }] });
}

const typeCustomerMeta = meta('type_customer', TypeCustomer, [column('id', { type: 'int' }), column('name'), column('code'), column('status', { type: 'int' })]);
const customerMeta = meta('customer', Customer, [
  column('id', { type: 'int' }), column('full_name'), column('number_phone_1'),
  column('status', { type: 'int' }), column('birthday', { type: 'date' }),
]);
relation(customerMeta, 'type_customer', 'type_customer_id', typeCustomerMeta, false);
const procedureMeta = meta('procedure_types', ProcedureType, [
  column('id', { type: 'int' }), column('name'), column('is_subtype', { type: 'boolean' }), column('parent_id', { type: 'int' }), column('is_active', { type: 'boolean' }),
]);
const dossierMeta = meta('dossiers', Dossier, [
  column('id', { type: 'int' }), column('object'), column('danger_level', { type: 'enum', enum: [0, 1, 2, 3], default: 1 }),
]);
relation(dossierMeta, 'client', 'client_id', customerMeta, false);
relation(dossierMeta, 'procedure_type', 'procedure_type_id', procedureMeta);
relation(dossierMeta, 'procedure_subtype', 'procedure_subtype_id', procedureMeta);

const ROWS: Record<string, any[]> = {
  type_customer: [
    { id: 1, name: 'Client particulier', code: 'PART', status: 1 },
    { id: 2, name: 'Entreprise', code: 'ENT', status: 1 },
    { id: 3, name: 'Ancien type', code: 'OLD', status: 0 },
  ],
  customer: [{ id: 40, full_name: 'BINGOUNA Alexis', status: 1 }],
  procedure_types: [
    { id: 5, name: 'Pénal', is_subtype: false, parent_id: null, is_active: true },
    { id: 6, name: 'Civil', is_subtype: false, parent_id: null, is_active: true },
    { id: 7, name: 'Trouble de jouissance', is_subtype: true, parent_id: 6, is_active: true },
    { id: 8, name: 'Diffamation', is_subtype: true, parent_id: 5, is_active: true },
  ],
};

const matches = (row: any, where: Record<string, any> = {}) => Object.entries(where).every(([key, value]) => row[key] === value);

function fakeDataSource() {
  const metas = [typeCustomerMeta, customerMeta, procedureMeta, dossierMeta];
  return {
    entityMetadatas: metas,
    getRepository: (target: Function) => {
      const table = metas.find((m) => m.target === target)!.tableName;
      const rows = () => ROWS[table] ?? [];
      return {
        count: jest.fn(async ({ where }: any = {}) => rows().filter((row) => matches(row, where)).length),
        find: jest.fn(async ({ where, take }: any = {}) => rows().filter((row) => matches(row, where)).slice(0, take ?? 100)),
        findOne: jest.fn(async ({ where }: any) => rows().find((row) => matches(row, where)) ?? null),
      };
    },
  };
}

const descriptions: Record<string, string> = {
  'customer.status': 'BD: 1=ACTIVE/Actif, 0=INACTIVE/Inactif, -2=BLOCKED/Bloqué.',
  'dossiers.danger_level': 'BD: 0=Faible, 1=Normal, 2=Élevé, 3=Critique.',
};
const labels: Record<string, string> = {
  'customer.type_customer_id': 'Type de client',
  'customer.number_phone_1': 'Téléphone principal',
  'customer.status': 'Statut',
  'dossiers.client_id': 'Client',
  'dossiers.procedure_type_id': 'Type de procédure',
  'dossiers.procedure_subtype_id': 'Sous-type de procédure',
  'dossiers.danger_level': "Niveau d'urgence",
};

function build({ denied = [] as string[], ambiguous = false } = {}) {
  const resolver = {
    resolveAnyEntity: jest.fn(async (table: string, term: string, _config?: any, filters?: Record<string, any>) => {
      const rows = (ROWS[table] ?? []).filter((row) => matches(row, filters));
      const exact = rows.filter((row) => String(row.code ?? '').toLowerCase() === term.toLowerCase());
      const found = exact.length ? exact : rows.filter((row) =>
        [row.name, row.full_name].some((v) => v && String(v).toLowerCase().includes(term.toLowerCase())));
      const candidates = found.map((entity) => ({ entity, score: 90, matchedOn: 'name' }));
      // Ambiguïté = plusieurs correspondances au même niveau : rien n'est retenu.
      const isAmbiguous = ambiguous && found.length > 0;
      return { found: found.length > 0 && !isAmbiguous, best: isAmbiguous ? null : found[0] ?? null, score: 90, matchedOn: 'name', candidates, ambiguous: isAmbiguous };
    }),
    searchCandidates: jest.fn(async (table: string, q: string, filters?: Record<string, any>) =>
      (ROWS[table] ?? []).filter((row) => matches(row, filters)).filter((row) =>
        [row.name, row.full_name, row.code].some((v) => v && String(v).toLowerCase().includes(q.toLowerCase())))),
  };
  const permissions = {
    assertCanWritePlan: jest.fn(async () => undefined),
    partitionReadableTables: jest.fn(async (_user: any, tables: string[]) => ({
      allowed: tables.filter((t) => !denied.includes(t)),
      denied: tables.filter((t) => denied.includes(t)),
    })),
  };
  const schemaMetadata = {
    getTableLabel: (table: string) => ({ customer: 'Clients', dossiers: 'Dossiers' } as Record<string, string>)[table] ?? table,
    getColumnMetadataMap: (table: string) => new Map(Object.entries(labels)
      .filter(([key]) => key.startsWith(`${table}.`))
      .map(([key, label]) => [key.split('.')[1], { label }])),
    getColumnDescription: (table: string, columnName: string) => descriptions[`${table}.${columnName}`] ?? '',
    formatTechnicalName: (name: string) => name.replace(/_/g, ' '),
  };
  const service = new PlanFieldsService(
    fakeDataSource() as any,
    { getHandler: () => undefined } as any,
    schemaMetadata as any,
    resolver as any,
    permissions as any,
    { neverAutoCreate: ['jurisdictions', 'procedure_types'] } as any,
  );
  return { service, resolver, permissions };
}

const plan = (operations: any[]) => ({ transaction: true, humanReadable: 'Plan', confidence: 0.9, operations });
const field = (response: any, op: number, name: string) => response.operations[op].fields.find((f: any) => f.name === name);

describe('PlanFieldsService', () => {
  it('reconnaît le type de client proposé par l’IA et liste les types actifs', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'customer', tempId: 'new_client', fields: { full_name: 'OVAMBE NDONO', type_customer: 'PART', number_phone_1: '694165300', status: 1 } },
    ]) as any);
    const type = field(response, 0, 'type_customer_id');
    expect(type).toMatchObject({ label: 'Type de client', kind: 'reference', value: 'PART', clears: ['type_customer'], editable: true });
    expect(type.selected).toEqual({ value: 1, label: 'Client particulier (PART)' });
    expect(type.options.map((o: any) => o.value)).toEqual([1, 2]);
    expect(field(response, 0, 'number_phone_1')).toMatchObject({ label: 'Téléphone principal', kind: 'text', editable: true });
  });

  it('montre le statut du client sans le laisser modifier à la création', async () => {
    const { service } = build();
    const insert = await service.describePlan(1, plan([{ operation: 'INSERT', entity: 'customer', fields: { full_name: 'X Y', status: 1 } }]) as any);
    expect(field(insert, 0, 'status')).toMatchObject({ kind: 'enum', editable: false, selected: { value: 1, label: 'Actif' }, note: 'Toujours « Actif » à la création' });
    const update = await service.describePlan(1, plan([{ operation: 'UPDATE', entity: 'customer', entityId: 40, fields: { status: '0' } }]) as any);
    expect(field(update, 0, 'status')).toMatchObject({ editable: true, selected: { value: 0, label: 'Inactif' } });
    expect(field(update, 0, 'status').options).toHaveLength(3);
  });

  it('propose le client créé par une opération précédente', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'customer', tempId: 'new_client', fields: { full_name: 'OVAMBE NDONO' } },
      { operation: 'INSERT', entity: 'dossiers', fields: { client_id: '{{new_client.id}}', object: 'Trouble', danger_level: 'Élevé' } },
    ]) as any);
    const client = field(response, 1, 'client_id');
    expect(client.selected).toEqual({ value: '{{new_client.id}}', label: 'OVAMBE NDONO (créé par ce plan)', createdBy: 0 });
    expect(client.options.map((o: any) => o.label)).toEqual(['OVAMBE NDONO (créé par ce plan)', 'BINGOUNA Alexis']);
    expect(field(response, 1, 'danger_level')).toMatchObject({ kind: 'enum', selected: { value: 2, label: 'Élevé' } });
  });

  it('passe en recherche au-delà de 100 lignes', async () => {
    const saved = ROWS.customer;
    ROWS.customer = Array.from({ length: 130 }, (_, i) => ({ id: i + 1, full_name: `Client ${i + 1}`, status: 1 }));
    try {
      const { service } = build();
      const response = await service.describePlan(1, plan([{ operation: 'INSERT', entity: 'dossiers', fields: { client_id: 3, object: 'X' } }]) as any);
      const client = field(response, 0, 'client_id');
      expect(client.searchable).toBe(true);
      expect(client.selected).toEqual({ value: 3, label: 'Client 3' });
      expect(client.options.length).toBeLessThanOrEqual(21);
    } finally {
      ROWS.customer = saved;
    }
  });

  it('ne liste ni ne résout une table que l’utilisateur ne peut pas lire, sauf référentiel partagé', async () => {
    const { service, resolver } = build({ denied: ['customer', 'type_customer'] });
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'dossiers', fields: { client: 'BINGOUNA', object: 'X' } },
      { operation: 'INSERT', entity: 'customer', fields: { full_name: 'Z', type_customer: 'ENT' } },
    ]) as any);
    expect(field(response, 0, 'client_id')).toMatchObject({ editable: false, note: 'Liste non consultable avec vos droits' });
    expect(resolver.resolveAnyEntity).not.toHaveBeenCalledWith('customer', expect.anything(), expect.anything(), expect.anything());
    expect(field(response, 1, 'type_customer_id').selected).toEqual({ value: 2, label: 'Entreprise (ENT)' });
  });

  it('filtre les sous-types sur le type de procédure choisi', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'dossiers', fields: { procedure_subtype: 'Trouble', procedure_type: 'Civil', object: 'X' } },
    ]) as any);
    // Type facultatif : « — Aucun — » en tête, puis la liste.
    expect(field(response, 0, 'procedure_type_id').options.map((o: any) => o.value)).toEqual([null, 5, 6]);
    expect(field(response, 0, 'procedure_type_id').selected).toEqual({ value: 6, label: 'Civil' });
    const subtype = field(response, 0, 'procedure_subtype_id');
    expect(subtype.dependsOn).toEqual(['procedure_type_id', 'procedure_type']);
    expect(subtype.options.map((o: any) => o.value)).toEqual([null, 7]);
    expect(subtype.selected).toEqual({ value: 7, label: 'Trouble de jouissance' });

    const refreshed = await service.fieldOptions(1, { entity: 'dossiers', operation: 'INSERT', field: 'procedure_subtype_id', fields: { procedure_type_id: 5 } });
    expect(refreshed.options).toEqual([{ value: 8, label: 'Diffamation' }]);
  });

  it("garde la valeur de l'IA quand la correspondance est ambiguë", async () => {
    const { service } = build({ ambiguous: true });
    const response = await service.describePlan(1, plan([{ operation: 'INSERT', entity: 'customer', fields: { full_name: 'Z', type_customer: 'e' } }]) as any);
    const type = field(response, 0, 'type_customer_id');
    expect(type.needsChoice).toBe(true);
    expect(type.selected).toEqual({ value: 'e', label: '« e » (à choisir)' });
    expect(type.note).toBe('Plusieurs correspondances exactes : choisissez la bonne');
  });

  it('réunit alias et colonne, met tout en lecture seule pour une suppression, sans exposer les lignes', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'dossiers', fields: { client: 'BINGOUNA', client_id: 40, object: 'X' } },
      { operation: 'DELETE', entity: 'customer', entityId: 40, fields: { full_name: 'BINGOUNA Alexis' } },
    ]) as any);
    const clients = response.operations[0].fields.filter((f: any) => f.name.startsWith('client'));
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ name: 'client_id', value: 40, clears: ['client'] });
    expect(response.operations[1].fields.every((f: any) => !f.editable)).toBe(true);
    const keys = response.operations.flatMap((op) => op.fields.flatMap((f: any) => (f.options ?? []).flatMap((o: any) => Object.keys(o))));
    expect(new Set(keys)).toEqual(new Set(['value', 'label']));
  });

  it('préfère la copie du cabinet d’un référentiel partagé, même quand la résolution hésite', async () => {
    const saved = ROWS.type_customer;
    ROWS.type_customer = [
      { id: 342, tenant_id: 1, name: 'Client Particulier', code: 'PARTICULIER', status: 1 },
      { id: 344, tenant_id: 1, name: 'Entreprise', code: 'ENTREPRISE', status: 1 },
      { id: 482, tenant_id: 25, name: 'Client Particulier', code: 'PARTICULIER', status: 1 },
    ];
    try {
      const { service } = build({ ambiguous: true });
      const response = await new TenantContext().run(25, () =>
        service.describePlan(1, plan([{ operation: 'INSERT', entity: 'customer', fields: { full_name: 'Z', type_customer: 'particulier' } }]) as any));
      const type = field(response, 0, 'type_customer_id');
      expect(type.selected).toEqual({ value: 482, label: 'Client Particulier (PARTICULIER)' });
      expect(type.needsChoice).toBeUndefined();
      expect(type.options.map((o: any) => o.value)).toEqual([482, 344]);
    } finally {
      ROWS.type_customer = saved;
    }
  });

  it('range les valeurs vides ou par défaut parmi les champs secondaires', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([{ operation: 'INSERT', entity: 'dossiers', fields: { object: '', danger_level: 1, client_id: 40 } }]) as any);
    expect(field(response, 0, 'object').secondary).toBe(true);
    expect(field(response, 0, 'danger_level')).toMatchObject({ secondary: true, selected: { value: 1, label: 'Normal' } });
    expect(field(response, 0, 'client_id').secondary).toBeUndefined();
  });

  it('cherche dans une grande table à la demande', async () => {
    const { service } = build();
    const result = await service.fieldOptions(1, { entity: 'dossiers', operation: 'INSERT', field: 'client', q: 'bingo' });
    expect(result).toEqual({ options: [{ value: 40, label: 'BINGOUNA Alexis' }], searchable: true });
  });
});

describe('GenericWriteService — références hors cabinet', () => {
  const service = new GenericWriteService(fakeDataSource() as any, {} as any);
  const check = (fields: Record<string, any>) =>
    (service as any).assertReferencesInScope({ operations: [{ operation: 'INSERT', entity: 'dossiers', fields }] });

  it('refuse un identifiant introuvable dans le cabinet', async () => {
    await expect(check({ client_id: 999 })).rejects.toThrow(BadRequestException);
    await expect(check({ client: '999' })).rejects.toThrow('« client » : la valeur 999 est introuvable dans ce cabinet.');
  });

  it('laisse passer les lignes visibles, les références du plan et les noms à résoudre', async () => {
    await expect(check({ client_id: 40, procedure_type_id: 6 })).resolves.toBeUndefined();
    await expect(check({ client_id: '{{new_client.id}}', procedure_type: 'Civil' })).resolves.toBeUndefined();
  });
});

describe('PlanFieldsService — listes', () => {
  it('résume une liste de liens au lieu de l’afficher en texte brut', async () => {
    const { service } = build();
    const response = await service.describePlan(1, plan([
      { operation: 'INSERT', entity: 'customer', tempId: 'new_client', fields: { full_name: 'OVAMBE NDONO' } },
      { operation: 'INSERT', entity: 'dossier_actions', fields: { audiences: ['{{new_client.id}}', 4] } },
    ]) as any);
    expect(field(response, 1, 'audiences')).toMatchObject({
      kind: 'text',
      editable: false,
      selected: { value: null, label: 'OVAMBE NDONO (créé par ce plan), 4' },
    });
  });
});
