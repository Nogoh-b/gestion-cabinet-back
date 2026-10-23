// src/core/ai-database/skills/ai-skill.service.ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { getExplicitTenantId } from 'src/core/tenant/tenant.context';
import { AiDatabasePermissionService } from '../ai-database-permission.service';
import { buildPermissionRefusal } from '../ai-access-policy';
import { AiSkillRegistry } from './ai-skill.registry';
import {
  AI_SKILL_CATEGORIES,
  AiSkillCatalogItem,
  AiSkillContext,
  AiSkillHandler,
  AiSkillOutcome,
} from './ai-skill.types';

/** Catalogue filtré par droits et plan, et exécution d'une compétence. */
@Injectable()
export class AiSkillService {
  constructor(
    private readonly registry: AiSkillRegistry,
    private readonly permissions: AiDatabasePermissionService,
    private readonly planQuota: PlanQuotaService,
  ) {}

  /** Compétences utilisables par l'utilisateur, dans l'ordre du menu. */
  async catalog(user: any): Promise<AiSkillCatalogItem[]> {
    const items: AiSkillCatalogItem[] = [];
    const plan = await this.currentPlan(user);
    for (const handler of this.registry.all()) {
      if (!(await this.isAllowed(user, handler, plan))) continue;
      const d = handler.definition;
      items.push({
        code: d.code,
        label: d.label,
        description: d.description,
        icon: d.icon,
        category: d.category,
        categoryLabel: AI_SKILL_CATEGORIES.find((c) => c.code === d.category)?.label ?? d.category,
        targets: d.targets ?? [],
        targetRequired: !!d.targetRequired,
        placeholder: d.placeholder,
        examples: d.examples ?? [],
        keywords: d.keywords ?? [],
        ...(d.autoTriggers?.length && { autoTriggers: d.autoTriggers }),
    ...(d.autoLaunchOnConsultation ? { autoLaunchOnConsultation: true as const } : {}),
        ...(d.autoExclude?.length && { autoExclude: d.autoExclude }),
      });
    }
    const order = AI_SKILL_CATEGORIES.map((c) => c.code);
    // Tri stable : l'ordre d'enregistrement est conservé dans chaque famille.
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => order.indexOf(a.item.category) - order.indexOf(b.item.category) || a.index - b.index)
      .map(({ item }) => item);
  }

  /** Vérifie droits et plan, puis exécute la compétence. */
  async run(code: string, ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const handler = this.registry.get(code);
    if (!handler) throw new NotFoundException(`Compétence inconnue : « ${code} ».`);
    const missing = await this.permissions.missingPermissions(ctx.user, handler.definition.permissions ?? []);
    if (missing.length) throw new ForbiddenException(buildPermissionRefusal(missing));
    const module = handler.definition.planModule;
    if (module) this.planQuota.assertModuleEnabled(await this.currentPlan(ctx.user), module);
    // Ancien code (« courrier », « document_modele »…) : son préremplissage, puis les paramètres reçus.
    const aliasParams = this.registry.aliasParams(code);
    return handler.run(aliasParams ? { ...ctx, params: { ...aliasParams, ...ctx.params } } : ctx);
  }

  /** Code courant d'une compétence (un ancien code fusionné donne sa compétence). */
  canonicalCode(code: string): string {
    return this.registry.get(code)?.definition.code ?? code;
  }

  label(code: string): string {
    return this.registry.get(code)?.definition.label ?? code;
  }

  /** Types d'enregistrements visés par la compétence (@ attendus). */
  targets(code: string): string[] {
    return this.registry.get(code)?.definition.targets ?? [];
  }

  /** La compétence exige-t-elle une fiche (sinon : tout le cabinet sans mention) ? */
  targetRequired(code: string): boolean {
    return this.registry.get(code)?.definition.targetRequired === true;
  }

  has(code: string): boolean {
    return !!this.registry.get(code);
  }

  /** Faits de la fiche mentionnée (dossier, client…), pour la conversation, le conseil et les documents. */
  recordFacts(references: any[], user: any, question?: string): Promise<string> {
    return this.registry.recordFacts(references, user, question);
  }

  /** Éléments de la fiche visée, insérables dans les éditeurs des brouillons. */
  draftReferences(references: any[], user: any) {
    return this.registry.draftReferences(references, user);
  }

  private async isAllowed(user: any, handler: AiSkillHandler, plan: any): Promise<boolean> {
    const module = handler.definition.planModule;
    if (module && !PlanQuotaService.planIncludes(plan, module)) return false;
    const missing = await this.permissions.missingPermissions(user, handler.definition.permissions ?? []);
    return missing.length === 0;
  }

  /** Plan du cabinet du jeton (comme AiQuotaGuard), sinon du contexte de la requête. */
  private async currentPlan(user: any) {
    const tenantId = Number(user?.tenantId) || getExplicitTenantId();
    return tenantId ? this.planQuota.getCabinetPlan(tenantId) : null;
  }
}
