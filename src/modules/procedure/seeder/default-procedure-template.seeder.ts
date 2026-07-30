// src/modules/procedure/seeder/default-procedure-template.seeder.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { findOneForTenant } from 'src/core/tenant/seeder-helper';
import { randomUUID } from 'crypto';
import { ProcedureTemplateLifecycle } from '../entities/procedure-template.entity';

/**
 * Nom canonique du template par défaut.
 * Utilisé par le DossierSubscriber pour retrouver ce template quand
 * le sous-type de procédure n'a pas de template propre.
 */
export const DEFAULT_PROCEDURE_TEMPLATE_NAME = 'Procédure générique — 5 étapes';

const DEFAULT_STAGES: Array<{
  order: number;
  name: string;
  canBeSkipped: boolean;
  canBeReentered: boolean;
  subStages: Array<{ order: number; name: string; isMandatory: boolean }>;
}> = [
  {
    order: 0,
    name: 'Initiation',
    canBeSkipped: false,
    canBeReentered: true,
    subStages: [
      { order: 0, name: 'Réception de la demande', isMandatory: true },
      { order: 1, name: 'Analyse préliminaire', isMandatory: true },
      { order: 2, name: 'Vérification de recevabilité', isMandatory: true },
      { order: 3, name: 'Ouverture formelle du dossier', isMandatory: true },
      { order: 4, name: 'Notification des parties adverses', isMandatory: false },
      { order: 5, name: 'Constitution du dossier', isMandatory: true },
    ],
  },
  {
    order: 1,
    name: 'Instruction / Mise en état',
    canBeSkipped: false,
    canBeReentered: true,
    subStages: [
      { order: 0, name: 'Échange d\'écritures / conclusions', isMandatory: true },
      { order: 1, name: 'Production des pièces', isMandatory: true },
      { order: 2, name: 'Demandes d\'expertises', isMandatory: false },
      { order: 3, name: 'Auditions / interrogatoires', isMandatory: false },
      { order: 4, name: 'Débats oraux / écrits', isMandatory: true },
      { order: 5, name: 'Clôture de l\'instruction', isMandatory: true },
    ],
  },
  {
    order: 2,
    name: 'Décision',
    canBeSkipped: false,
    canBeReentered: false,
    subStages: [
      { order: 0, name: 'Audience de plaidoirie', isMandatory: true },
      { order: 1, name: 'Délibéré', isMandatory: true },
      { order: 2, name: 'Prononcé de la décision', isMandatory: true },
      { order: 3, name: 'Notification de la décision', isMandatory: true },
      { order: 4, name: 'Ouverture du délai de recours', isMandatory: true },
    ],
  },
  {
    order: 3,
    name: 'Exécution et suivi',
    canBeSkipped: false,
    canBeReentered: true,
    subStages: [
      { order: 0, name: 'Obtention de la formule exécutoire', isMandatory: true },
      { order: 1, name: 'Mesures pécuniaires', isMandatory: false },
      { order: 2, name: 'Mesures non pécuniaires', isMandatory: false },
      { order: 3, name: 'Suivi de l\'exécution', isMandatory: true },
      { order: 4, name: 'Gestion des incidents d\'exécution', isMandatory: false },
    ],
  },
  {
    order: 4,
    name: 'Clôture',
    canBeSkipped: false,
    canBeReentered: false,
    subStages: [
      { order: 0, name: 'Vérification de l\'extinction des obligations', isMandatory: true },
      { order: 1, name: 'Règlement des frais et dépens', isMandatory: true },
      { order: 2, name: 'Archivage du dossier', isMandatory: true },
      { order: 3, name: 'Information finale des parties', isMandatory: true },
      { order: 4, name: 'Clôture définitive', isMandatory: true },
    ],
  },
];

export default class DefaultProcedureTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const templateRepo   = dataSource.getRepository(ProcedureTemplate);
    const stageRepo      = dataSource.getRepository(Stage);
    const subStageRepo   = dataSource.getRepository(SubStage);
    const transitionRepo = dataSource.getRepository(Transition);

    // ── Idempotence : ne rien faire si le template existe déjà (per-tenant) ──
    const existing = await findOneForTenant(templateRepo, 'name', DEFAULT_PROCEDURE_TEMPLATE_NAME);

    if (existing) {
      console.log(`⏩ Template par défaut déjà présent (ID: ${existing.id}) — aucune modification`);
      return existing;
    }

    // ── Création du template ─────────────────────────────────────────────────
    const template = await templateRepo.save(
      templateRepo.create({
        familyId: randomUUID(),
        name: DEFAULT_PROCEDURE_TEMPLATE_NAME,
        description:
          'Template générique 5 étapes utilisé quand le sous-type de procédure n\'a pas de template propre. ' +
          'Toutes les transitions sont permises.',
        version: 1,
        lifecycleStatus: ProcedureTemplateLifecycle.DRAFT,
        publishedAt: null,
        retiredAt: null,
        contentHash: null,
      }),
    );
    console.log(`✅ Template par défaut créé (ID: ${template.id})`);

    // ── Création des stages et sous-étapes ───────────────────────────────────
    const savedStages: Stage[] = [];

    for (const stageData of DEFAULT_STAGES) {
      const stage = await stageRepo.save(
        stageRepo.create({
          order:          stageData.order,
          name:           stageData.name,
          description:    stageData.name,
          canBeSkipped:   stageData.canBeSkipped,
          canBeReentered: stageData.canBeReentered,
          templateId:     template.id,
        }),
      );
      savedStages.push(stage);

      for (const ssData of stageData.subStages) {
        await subStageRepo.save(
          subStageRepo.create({
            order:       ssData.order,
            name:        ssData.name,
            description: ssData.name,
            isMandatory: ssData.isMandatory,
            stageId:     stage.id,
          }),
        );
      }
      console.log(`  📍 Stage "${stage.name}" — ${stageData.subStages.length} sous-étape(s)`);
    }

    // ── Transitions : toutes les paires possibles (allow everything) ─────────
    let transitionCount = 0;

    for (let i = 0; i < savedStages.length; i++) {
      for (let j = 0; j < savedStages.length; j++) {
        if (i === j) continue;

        const isForward  = j === i + 1;   // transition séquentielle naturelle
        const isDefault  = isForward;      // seules les transitions "suivant" sont par défaut

        await transitionRepo.save(
          transitionRepo.create({
            fromStageId:          savedStages[i].id,
            toStageId:            savedStages[j].id,
            type:                 'manual',
            label:                isForward
              ? null
              : `Aller vers ${savedStages[j].name}`,
            isDefault:            isDefault,
            requiresDecision:     true,
            requiresValidation:   false,
            templateId:           template.id,
            expectsUserInput:     false,
            userInputs:           null,
            preTransitionActions: null,
            postTransitionActions: null,
            onTransition:         null,
          } as any),
        );
        transitionCount++;
      }
    }

    console.log(
      `  🔄 ${transitionCount} transitions créées ` +
      `(${savedStages.length} stages → toutes les combinaisons permises)`,
    );
    console.log(`\n🎉 Brouillon générique créé : "${DEFAULT_PROCEDURE_TEMPLATE_NAME}"`);

    return template;
  }
}
