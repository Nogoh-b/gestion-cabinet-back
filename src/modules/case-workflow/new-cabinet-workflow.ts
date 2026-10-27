import { EntityManager } from 'typeorm';
import { PlatformSetting } from '../platform/entities/platform-setting.entity';
import {
  mergeSection,
  PLATFORM_SETTING_DEFAULTS,
} from '../platform/settings/platform-settings.service';
import { WorkflowEngine } from './case-workflow.enums';
import { CaseWorkflowFeature } from './entities/workflow-audit.entity';

/**
 * Parcours dossier d'un cabinet qui vient d'être créé. Sans ligne
 * `case_workflow_features`, ses dossiers resteraient en `LEGACY` : on pose donc
 * le parcours choisi par la plateforme (Paramètres → Parcours des dossiers).
 * Une ligne déjà posée par le profil de référentiel est conservée telle quelle.
 */
export async function initializeNewCabinetWorkflow(
  em: EntityManager,
  cabinetId: number,
): Promise<CaseWorkflowFeature> {
  const existing = await em.findOneBy(CaseWorkflowFeature, {
    tenant_id: cabinetId,
  });
  if (existing) return existing;
  const setting = await em.findOneBy(PlatformSetting, { key: 'workflow' });
  const { new_cabinet_engine } = mergeSection(
    PLATFORM_SETTING_DEFAULTS.workflow,
    setting?.value,
  );
  return em.save(
    CaseWorkflowFeature,
    em.create(CaseWorkflowFeature, {
      tenant_id: cabinetId,
      enabled: true,
      default_for_new_dossiers: new_cabinet_engine === WorkflowEngine.ACTIONS_V2,
    }),
  );
}
