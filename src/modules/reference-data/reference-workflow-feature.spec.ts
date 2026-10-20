import { ReferenceAdapter } from './reference-adapter';
import { ReferenceRegistry } from './reference-registry';
import { CaseWorkflowFeature } from '../case-workflow/entities/workflow-audit.entity';
import { ReferenceItem } from './reference-data.types';

const featureColumns = [
  {
    propertyName: 'enabled',
    type: 'boolean',
    isNullable: false,
    default: true,
  },
  {
    propertyName: 'default_for_new_dossiers',
    type: 'boolean',
    isNullable: false,
    default: false,
  },
];
const stubDb = {
  getMetadata: (entity: any) =>
    entity === CaseWorkflowFeature
      ? {
          target: entity,
          tableName: 'case_workflow_features',
          columns: featureColumns,
          relations: [],
        }
      : { target: entity, tableName: 'other', columns: [], relations: [] },
} as any;

const feature = (
  values: Record<string, unknown>,
  key = 'parcours-dossier',
  active = true,
): ReferenceItem => ({
  kind: 'case_workflow_features',
  key,
  active,
  values,
  links: {},
});

function stubEm(candidates: any[]) {
  const qb: any = {
    withDeleted: () => qb,
    where: () => qb,
    setLock: () => qb,
    leftJoinAndSelect: () => qb,
    getMany: async () => candidates,
  };
  return {
    getRepository: () => ({
      findOne: async () => ({ id: 22 }),
      createQueryBuilder: () => qb,
    }),
    findOneBy: async () => null,
    findBy: async () => [],
  } as any;
}

describe('Parcours dossier en référentiel', () => {
  const registry = new ReferenceRegistry(stubDb);
  const adapter = new ReferenceAdapter(registry, stubDb);

  it('expose le kind dans la famille Actions', () => {
    expect(registry.definition('case_workflow_features')).toEqual([
      'case_workflow_features',
      'Actions',
      'Parcours dossier',
      CaseWorkflowFeature,
    ]);
    const schema = registry
      .schema()
      .find((s) => s.kind === 'case_workflow_features')!;
    expect(schema.fields).toEqual([
      expect.objectContaining({ name: 'enabled', type: 'boolean' }),
      expect.objectContaining({
        name: 'default_for_new_dossiers',
        type: 'boolean',
      }),
    ]);
  });

  it('accepte un paramétrage singleton valide', () => {
    const errors = registry.validate(
      [feature({ enabled: true, default_for_new_dossiers: true })],
      new Set(),
    );
    expect(errors.filter((e) => /parcours|case_workflow/i.test(e))).toEqual([]);
  });

  it('refuse un second paramétrage, une désactivation ou V2 sans parcours', () => {
    const valid = feature({ enabled: true, default_for_new_dossiers: false });
    expect(
      registry.validate([valid, feature({ enabled: true }, 'autre')], new Set()),
    ).toContain('Un seul paramétrage du parcours dossier est autorisé');
    expect(
      registry.validate(
        [feature({ enabled: true }, 'parcours-dossier', false)],
        new Set(),
      ),
    ).toContain(
      'case_workflow_features/parcours-dossier: le paramétrage du parcours ne peut pas être désactivé',
    );
    expect(
      registry.validate(
        [feature({ enabled: false, default_for_new_dossiers: true })],
        new Set(),
      ),
    ).toContain(
      'case_workflow_features/parcours-dossier: « Nouveaux dossiers en V2 » requiert le parcours activé',
    );
    expect(
      registry.validate([feature({ enabled: 'oui' as any })], new Set()),
    ).toContain(
      'case_workflow_features/parcours-dossier: booléen requis enabled',
    );
  });

  it('rattache la ligne locale au lieu de créer un doublon', async () => {
    const row = {
      id: 'f1',
      tenant_id: 22,
      enabled: true,
      default_for_new_dossiers: false,
      deleted_at: null,
    };
    const snapshot = await adapter.snapshot(
      22,
      [feature({ enabled: true, default_for_new_dossiers: true })],
      stubEm([row]),
    );
    expect(snapshot.local.get('case_workflow_features/parcours-dossier')).toBe(row);
    // Valeur locale différente, sans provenance : conflit, préservé par défaut.
    expect(
      adapter.changes(
        [feature({ enabled: true, default_for_new_dossiers: true })],
        snapshot,
      )[0].action,
    ).toBe('conflict');
  });

  it('ne propose rien quand la valeur locale est identique', async () => {
    const row = {
      id: 'f1',
      tenant_id: 22,
      enabled: true,
      default_for_new_dossiers: true,
      deleted_at: null,
    };
    const snapshot = await adapter.snapshot(
      22,
      [feature({ enabled: true, default_for_new_dossiers: true })],
      stubEm([row]),
    );
    expect(
      adapter.changes(
        [feature({ enabled: true, default_for_new_dossiers: true })],
        snapshot,
      )[0].action,
    ).toBe('unchanged');
  });

  it('crée la ligne quand le cabinet n’en a pas', async () => {
    const snapshot = await adapter.snapshot(
      22,
      [feature({ enabled: true, default_for_new_dossiers: true })],
      stubEm([]),
    );
    expect(
      snapshot.local.get('case_workflow_features/parcours-dossier'),
    ).toBeNull();
    expect(
      adapter.changes(
        [feature({ enabled: true, default_for_new_dossiers: true })],
        snapshot,
      )[0].action,
    ).toBe('create');
  });
});
