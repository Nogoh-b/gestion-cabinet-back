import { NotFoundException } from '@nestjs/common';
import { WorkflowEngine } from 'src/modules/case-workflow/case-workflow.enums';
import { PlatformCabinetsService } from './platform-cabinets.service';

/** Base minimale : cabinets, case_workflow_features et dossiers en mémoire. */
function stubDb(feature: Record<string, any> | null) {
  const state = { feature };
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (sql.startsWith('SELECT id FROM cabinets')) return params[0] === 5 ? [{ id: 5 }] : [];
    if (sql.includes('FROM dossiers'))
      return [
        { engine: 'LEGACY', total: '4' },
        { engine: 'ACTIONS_V2', total: '1' },
      ];
    if (sql.startsWith('SELECT id FROM case_workflow_features'))
      return state.feature ? [{ id: state.feature.id }] : [];
    if (sql.includes('FROM case_workflow_features'))
      return state.feature && !state.feature.deleted_at ? [state.feature] : [];
    if (sql.startsWith('INSERT INTO case_workflow_features')) {
      state.feature = {
        id: params[0],
        enabled: 1,
        default_for_new_dossiers: params[2],
        deleted_at: null,
      };
      return [];
    }
    if (sql.startsWith('UPDATE case_workflow_features')) {
      state.feature = {
        ...state.feature!,
        enabled: sql.includes('enabled = 1') ? 1 : state.feature!.enabled,
        default_for_new_dossiers: params[0],
        deleted_at: null,
      };
      return [];
    }
    throw new Error('Requête inattendue : ' + sql);
  });
  return { query, state };
}

const service = (db: any) =>
  new PlatformCabinetsService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

describe('Plateforme — parcours dossier d’un cabinet', () => {
  it('lit le parcours des prochains dossiers et la répartition existante', async () => {
    const db = stubDb({ id: 'f', enabled: 1, default_for_new_dossiers: 1 });
    expect(await service(db).workflow(5)).toEqual({
      configured: true,
      enabled: true,
      new_dossiers_engine: WorkflowEngine.ACTIONS_V2,
      dossiers: { LEGACY: 4, ACTIONS_V2: 1 },
    });
  });

  it('considère un cabinet sans paramétrage comme historique', async () => {
    const result = await service(stubDb(null)).workflow(5);
    expect(result.configured).toBe(false);
    expect(result.new_dossiers_engine).toBe(WorkflowEngine.LEGACY);
  });

  it('passe un cabinet existant en V2 sans toucher aux dossiers', async () => {
    const db = stubDb(null);
    const result = await service(db).setWorkflow(5, WorkflowEngine.ACTIONS_V2);
    expect(result.new_dossiers_engine).toBe(WorkflowEngine.ACTIONS_V2);
    expect(db.state.feature).toMatchObject({ enabled: 1, default_for_new_dossiers: 1 });
    expect(
      db.query.mock.calls.some(([sql]) => /UPDATE dossiers|INSERT INTO dossiers/.test(sql)),
    ).toBe(false);
  });

  it('repasse en historique en gardant le parcours V2 actif pour les dossiers V2', async () => {
    const db = stubDb({ id: 'f', enabled: 1, default_for_new_dossiers: 1, deleted_at: null });
    const result = await service(db).setWorkflow(5, WorkflowEngine.LEGACY);
    expect(result).toMatchObject({ enabled: true, new_dossiers_engine: WorkflowEngine.LEGACY });
  });

  it('réactive une ligne supprimée plutôt que d’en créer une seconde', async () => {
    const db = stubDb({ id: 'f', enabled: 0, default_for_new_dossiers: 0, deleted_at: new Date() });
    await service(db).setWorkflow(5, WorkflowEngine.ACTIONS_V2);
    expect(db.state.feature).toMatchObject({ id: 'f', enabled: 1, deleted_at: null });
  });

  it('refuse un cabinet inconnu', async () => {
    await expect(service(stubDb(null)).workflow(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
