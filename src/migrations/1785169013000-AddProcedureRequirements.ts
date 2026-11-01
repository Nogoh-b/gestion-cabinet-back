import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcedureRequirements1785169013000
  implements MigrationInterface
{
  name = 'AddProcedureRequirements1785169013000';

  private parseJson(value: any): any {
    if (value === null || value === undefined || value === '') return null;
    if (Buffer.isBuffer(value)) value = value.toString('utf8');
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private hash(value: Record<string, any>): string {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sub_stages
        ADD COLUMN requirements JSON NULL AFTER isMandatory
    `);
    await queryRunner.query(`
      UPDATE sub_stages SET requirements = JSON_ARRAY()
      WHERE requirements IS NULL
    `);

    const templates: any[] = await queryRunner.query(`
      SELECT id, family_id, name, description, version
      FROM procedure_templates
    `);
    for (const template of templates) {
      const stages: any[] = await queryRunner.query(
        `SELECT id, name, description, \`order\`, canBeSkipped, canBeReentered
         FROM stages WHERE templateId = ? ORDER BY \`order\`, id`,
        [template.id],
      );
      for (const stage of stages) {
        const subStages: any[] = await queryRunner.query(
          `SELECT id, name, description, \`order\`, isMandatory, requirements
           FROM sub_stages WHERE stageId = ? ORDER BY \`order\`, id`,
          [stage.id],
        );
        const configs: any[] = await queryRunner.query(
          `SELECT allowDocuments, allowDiligences, allowInvoices, allowHearings,
                  documentTypesAllowed, diligenceConfig, hearingConfig, invoiceConfig
           FROM stage_configs WHERE stageId = ? LIMIT 1`,
          [stage.id],
        );
        const config = configs[0];
        stage.canBeSkipped = !!stage.canBeSkipped;
        stage.canBeReentered = !!stage.canBeReentered;
        stage.config = config
          ? {
              allowDocuments: !!config.allowDocuments,
              allowDiligences: !!config.allowDiligences,
              allowInvoices: !!config.allowInvoices,
              allowHearings: !!config.allowHearings,
              documentTypesAllowed:
                this.parseJson(config.documentTypesAllowed) ?? [],
              diligenceConfig:
                this.parseJson(config.diligenceConfig) ?? null,
              hearingConfig: this.parseJson(config.hearingConfig) ?? null,
              invoiceConfig: this.parseJson(config.invoiceConfig) ?? null,
            }
          : null;
        stage.subStages = subStages.map((subStage) => ({
          id: subStage.id,
          name: subStage.name,
          description: subStage.description ?? null,
          order: subStage.order,
          isMandatory: !!subStage.isMandatory,
          requirements: this.parseJson(subStage.requirements) ?? [],
        }));
      }

      const rawTransitions: any[] = await queryRunner.query(
        `SELECT id, fromStageId, toStageId, type, label, \`condition\`,
                triggerEvent, triggerCondition, isDefault, requiresDecision,
                requiresValidation, onTransition
         FROM transitions WHERE templateId = ? ORDER BY id`,
        [template.id],
      );
      const transitions = rawTransitions.map((transition) => ({
        id: transition.id,
        fromStageId: transition.fromStageId,
        toStageId: transition.toStageId,
        type: transition.type,
        label: transition.label ?? null,
        condition: this.parseJson(transition.condition),
        triggerEvent: transition.triggerEvent ?? null,
        triggerCondition: this.parseJson(transition.triggerCondition),
        isDefault: !!transition.isDefault,
        requiresDecision: !!transition.requiresDecision,
        requiresValidation: !!transition.requiresValidation,
        onTransition: this.parseJson(transition.onTransition),
      }));
      const rawCycles: any[] = await queryRunner.query(
        `SELECT id, fromStageId, toStageId, label, \`condition\`, maxLoops
         FROM cycles WHERE templateId = ? ORDER BY id`,
        [template.id],
      );
      const cycles = rawCycles.map((cycle) => ({
        id: cycle.id,
        fromStageId: cycle.fromStageId,
        toStageId: cycle.toStageId,
        label: cycle.label ?? null,
        condition: this.parseJson(cycle.condition),
        maxLoops: cycle.maxLoops,
      }));
      const snapshot = {
        familyId: template.family_id,
        versionId: template.id,
        version: template.version,
        name: template.name,
        description: template.description ?? null,
        stages,
        transitions,
        cycles,
      };
      await queryRunner.query(
        `UPDATE procedure_templates SET content_hash = ? WHERE id = ?`,
        [this.hash(snapshot), template.id],
      );
    }

    const instances: any[] = await queryRunner.query(`
      SELECT id, template_snapshot
      FROM procedure_instances
      WHERE template_snapshot IS NOT NULL
    `);
    for (const instance of instances) {
      const snapshot = this.parseJson(instance.template_snapshot);
      if (!snapshot || !Array.isArray(snapshot.stages)) continue;
      for (const stage of snapshot.stages) {
        for (const subStage of stage.subStages ?? []) {
          if (!Array.isArray(subStage.requirements)) {
            subStage.requirements = [];
          }
        }
      }
      await queryRunner.query(
        `UPDATE procedure_instances
         SET template_snapshot = ?, template_snapshot_hash = ?
         WHERE id = ?`,
        [JSON.stringify(snapshot), this.hash(snapshot), instance.id],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sub_stages DROP COLUMN requirements
    `);
  }
}
