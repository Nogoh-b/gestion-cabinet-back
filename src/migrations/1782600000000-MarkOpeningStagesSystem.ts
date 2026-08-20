import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nettoyage des stages runtime "Ouverture" (bug de pollution du template).
 *
 * Contexte : `ProcedureInstanceService.create()` créait, à chaque création
 * d'instance, un stage "Ouverture" PERSISTÉ sur le template de procédure
 * (`templateId`, `order: 0`, `canBeSkipped: true`, sans sous-étapes). Au
 * `create()` suivant, `firstStage = template.stages.sort(order)[0]` pouvait
 * donc sélectionner ce stage runtime → `currentStageId` = "Ouverture" pour
 * toutes les instances créées ensuite. Aucune transition ne partant de ce
 * stage, l'instance restait bloquée dessus (même après clôture du dossier,
 * qui ne touche pas l'instance de procédure), et l'UI affichait
 * "Ouverture / Étape courante / Optionnelle / Aucune sous-étape définie".
 *
 * Cette migration :
 *  1. Ajoute la colonne `stages.isSystem` (idempotent — utile en prod où
 *     `synchronize` est désactivé).
 *  2. Marque les stages runtime "Ouverture" existants comme `isSystem = 1`
 *     (ils sont désormais exclus des templates, du mapper et de l'affichage).
 *  3. Réinitialise `currentStageId` des instances qui pointent vers un stage
 *     système sur la première vraie étape (non-système) de leur template.
 *
 * NB : on ne SUPPRIME PAS les stages "Ouverture" : `stage_visits.stageId`
 * est en `ON DELETE CASCADE`, supprimer le stage supprimerait sa visite n°1
 * (et casserait le lien facture d'ouverture via `stage_visit_id`).
 */
export class MarkOpeningStagesSystem1782600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Colonne isSystem (idempotent) ──────────────────────────────────
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'stages'
          AND COLUMN_NAME = 'isSystem'
        LIMIT 1`,
    );
    if (cols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE stages ADD COLUMN isSystem tinyint NOT NULL DEFAULT 0`,
      );
    }

    // ── 2. Marquer les stages runtime "Ouverture" existants ───────────────
    const updateResult = await queryRunner.query(
      `UPDATE stages
          SET isSystem = 1
        WHERE name = 'Ouverture'
          AND canBeSkipped = 1
          AND description LIKE 'Phase d%ouverture%'`,
    );
    console.log(
      `[MarkOpeningStagesSystem] ${(updateResult as any)?.affectedRows ?? updateResult?.[0]?.affectedRows ?? '?'} stage(s) "Ouverture" marqué(s) isSystem`,
    );

    // ── 3. Corriger les instances dont l'étape courante est un stage système ──
    const instances: Array<{ id: string; templateId: string }> = await queryRunner.query(
      `SELECT pi.id, pi.templateId
         FROM procedure_instances pi
         JOIN stages s ON s.id = pi.currentStageId
        WHERE s.isSystem = 1`,
    );

    let fixed = 0;
    for (const inst of instances) {
      const firstReal: Array<{ id: string }> = await queryRunner.query(
        `SELECT id
           FROM stages
          WHERE templateId = ?
            AND isSystem = 0
          ORDER BY \`order\` ASC, createdAt ASC
          LIMIT 1`,
        [inst.templateId],
      );

      if (firstReal.length > 0 && firstReal[0].id !== inst.id) {
        await queryRunner.query(
          `UPDATE procedure_instances SET currentStageId = ? WHERE id = ?`,
          [firstReal[0].id, inst.id],
        );
        fixed++;
      } else if (firstReal.length === 0) {
        console.warn(
          `[MarkOpeningStagesSystem] Instance ${inst.id} : template ${inst.templateId} sans étape non-système — laissée inchangée`,
        );
      }
    }
    console.log(
      `[MarkOpeningStagesSystem] ${instances.length} instance(s) concernée(s), ${fixed} currentStageId corrigé(s)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration corrective : on ne restaure pas l'ancien état (les stages
    // "Ouverture" restent en base en tant qu'étapes système ; les
    // currentStageId corrigés pointent vers de vraies étapes).
    console.log('[MarkOpeningStagesSystem] down : aucune action (correctif irréversible)');
  }
}
