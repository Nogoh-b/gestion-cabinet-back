import { BadRequestException } from '@nestjs/common';
import { initializeNewCabinetWorkflow } from './new-cabinet-workflow';
import { WorkflowEngine } from './case-workflow.enums';
import { CaseWorkflowFeature } from './entities/workflow-audit.entity';
import { PlatformSetting } from '../platform/entities/platform-setting.entity';
import {
  PLATFORM_SETTING_DEFAULTS,
  PlatformSettingsService,
} from '../platform/settings/platform-settings.service';

function stubEm(feature: any, setting?: any) {
  return {
    findOneBy: jest.fn(async (entity: any) =>
      entity === CaseWorkflowFeature ? feature : setting,
    ),
    create: jest.fn((_entity: any, value: any) => ({ ...value })),
    save: jest.fn(async (_entity: any, value: any) => value),
  } as any;
}

describe('Parcours dossier d’un nouveau cabinet', () => {
  it('démarre en V2 par défaut', async () => {
    expect(PLATFORM_SETTING_DEFAULTS.workflow.new_cabinet_engine).toBe(
      WorkflowEngine.ACTIONS_V2,
    );
    const em = stubEm(null, null);
    const feature = await initializeNewCabinetWorkflow(em, 31);
    expect(em.findOneBy).toHaveBeenCalledWith(PlatformSetting, {
      key: 'workflow',
    });
    expect(em.save).toHaveBeenCalledWith(CaseWorkflowFeature, {
      tenant_id: 31,
      enabled: true,
      default_for_new_dossiers: true,
    });
    expect(feature.default_for_new_dossiers).toBe(true);
  });

  it('applique le choix plateforme LEGACY', async () => {
    const em = stubEm(null, {
      key: 'workflow',
      value: { new_cabinet_engine: WorkflowEngine.LEGACY },
    });
    const feature = await initializeNewCabinetWorkflow(em, 31);
    expect(feature).toEqual({
      tenant_id: 31,
      enabled: true,
      default_for_new_dossiers: false,
    });
  });

  it('conserve le paramétrage posé par le profil de référentiel', async () => {
    const fromProfile = {
      tenant_id: 31,
      enabled: true,
      default_for_new_dossiers: false,
    };
    const em = stubEm(fromProfile);
    expect(await initializeNewCabinetWorkflow(em, 31)).toBe(fromProfile);
    expect(em.save).not.toHaveBeenCalled();
  });

  it('refuse un parcours inconnu dans les paramètres plateforme', async () => {
    const repo = {
      find: jest.fn(async () => []),
      save: jest.fn(),
    };
    const service = new PlatformSettingsService(repo as any);
    await expect(
      service.update({ workflow: { new_cabinet_engine: 'V3' as any } }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();

    await service.update(
      { workflow: { new_cabinet_engine: WorkflowEngine.LEGACY } },
      1,
    );
    expect(repo.save).toHaveBeenCalledWith({
      key: 'workflow',
      value: { new_cabinet_engine: WorkflowEngine.LEGACY },
      updated_by_admin_id: 1,
    });
  });
});
