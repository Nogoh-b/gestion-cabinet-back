import { createHash } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class VersionProcedureTemplates1785169007000
  implements MigrationInterface
{
  name = 'VersionProcedureTemplates1785169007000';

  private parseJson(value: any): any {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE procedure_templates
        ADD COLUMN family_id CHAR(36) NULL AFTER id,
        ADD COLUMN lifecycle_status ENUM('DRAFT','PUBLISHED','RETIRED') NOT NULL DEFAULT 'DRAFT' AFTER version,
        ADD COLUMN published_at DATETIME NULL,
        ADD COLUMN retired_at DATETIME NULL,
        ADD COLUMN content_hash CHAR(64) NULL
    `);
    await queryRunner.query(`
      UPDATE procedure_templates
      SET family_id = id,
          lifecycle_status = CASE WHEN isActive = 1 THEN 'PUBLISHED' ELSE 'RETIRED' END,
          published_at = CASE WHEN isActive = 1 THEN COALESCE(updated_at, created_at, UTC_TIMESTAMP()) ELSE NULL END,
          retired_at = CASE WHEN isActive = 0 THEN COALESCE(updated_at, UTC_TIMESTAMP()) ELSE NULL END
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_templates
        MODIFY family_id CHAR(36) NOT NULL
    `);

    const indexes: Array<{ Key_name: string; Column_name: string }> =
      await queryRunner.query(
        `SHOW INDEX FROM procedure_templates WHERE Non_unique = 0`,
      );
    const grouped = new Map<string, string[]>();
    for (const index of indexes) {
      const columns = grouped.get(index.Key_name) ?? [];
      columns.push(index.Column_name);
      grouped.set(index.Key_name, columns);
    }
    for (const [name, columns] of grouped) {
      if (
        name !== 'PRIMARY' &&
        columns.includes('tenant_id') &&
        columns.includes('name')
      ) {
        await queryRunner.query(
          `ALTER TABLE procedure_templates DROP INDEX \`${name.replace(/`/g, '')}\``,
        );
      }
    }
    await queryRunner.query(`
      ALTER TABLE procedure_templates
        ADD UNIQUE KEY uq_template_family_version (tenant_id, family_id, version)
    `);

    await queryRunner.query(`
      ALTER TABLE procedure_instances
        ADD COLUMN template_family_id CHAR(36) NULL AFTER templateId,
        ADD COLUMN template_version_id CHAR(36) NULL AFTER template_family_id,
        ADD COLUMN template_snapshot JSON NULL AFTER template_version_id,
        ADD COLUMN template_snapshot_hash CHAR(64) NULL AFTER template_snapshot
    `);

    const templates: any[] = await queryRunner.query(
      `SELECT id, family_id, name, description, version FROM procedure_templates`,
    );
    for (const template of templates) {
      const stages: any[] = await queryRunner.query(
        `SELECT id, name, description, \`order\`, canBeSkipped, canBeReentered
         FROM stages WHERE templateId = ? ORDER BY \`order\`, id`,
        [template.id],
      );
      for (const stage of stages) {
        const subStages = await queryRunner.query(
          `SELECT id, name, description, \`order\`, isMandatory
           FROM sub_stages WHERE stageId = ? ORDER BY \`order\`, id`,
          [stage.id],
        );
        const configs = await queryRunner.query(
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
              diligenceConfig: this.parseJson(config.diligenceConfig) ?? null,
              hearingConfig: this.parseJson(config.hearingConfig) ?? null,
              invoiceConfig: this.parseJson(config.invoiceConfig) ?? null,
            }
          : null;
        stage.subStages = subStages.map((subStage: any) => ({
          ...subStage,
          isMandatory: !!subStage.isMandatory,
        }));
      }
      const rawTransitions = await queryRunner.query(
        `SELECT id, fromStageId, toStageId, type, label, \`condition\`,
                triggerEvent, triggerCondition, isDefault, requiresDecision,
                requiresValidation, onTransition
         FROM transitions WHERE templateId = ? ORDER BY id`,
        [template.id],
      );
      const transitions = rawTransitions.map((transition: any) => ({
        ...transition,
        condition: this.parseJson(transition.condition),
        triggerCondition: this.parseJson(transition.triggerCondition),
        onTransition: this.parseJson(transition.onTransition),
        isDefault: !!transition.isDefault,
        requiresDecision: !!transition.requiresDecision,
        requiresValidation: !!transition.requiresValidation,
      }));
      const rawCycles = await queryRunner.query(
        `SELECT id, fromStageId, toStageId, label, \`condition\`, maxLoops
         FROM cycles WHERE templateId = ? ORDER BY id`,
        [template.id],
      );
      const cycles = rawCycles.map((cycle: any) => ({
        ...cycle,
        condition: this.parseJson(cycle.condition),
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
      const hash = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');
      await queryRunner.query(
        `UPDATE procedure_templates SET content_hash = ? WHERE id = ?`,
        [hash, template.id],
      );
      await queryRunner.query(
        `UPDATE procedure_instances
         SET template_family_id = ?,
             template_version_id = ?,
             template_snapshot = ?,
             template_snapshot_hash = ?
         WHERE templateId = ?`,
        [
          template.family_id,
          template.id,
          JSON.stringify(snapshot),
          hash,
          template.id,
        ],
      );
    }

    await queryRunner.query(`
      ALTER TABLE procedure_instances
        MODIFY template_family_id CHAR(36) NOT NULL,
        MODIFY template_version_id CHAR(36) NOT NULL,
        MODIFY template_snapshot JSON NOT NULL,
        MODIFY template_snapshot_hash CHAR(64) NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        MODIFY status VARCHAR(32) NOT NULL DEFAULT 'active'
    `);
    await queryRunner.query(`
      UPDATE procedure_instances
      SET status = CASE
        WHEN LOWER(status) IN ('completed','closed') THEN 'COMPLETED'
        WHEN LOWER(status) IN ('abandoned','cancelled') THEN 'CANCELLED'
        ELSE 'ACTIVE'
      END
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        MODIFY status ENUM('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        MODIFY status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      UPDATE procedure_instances
      SET status = CASE
        WHEN status = 'COMPLETED' THEN 'completed'
        WHEN status = 'CANCELLED' THEN 'abandoned'
        ELSE 'active'
      END
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        MODIFY status ENUM('active','suspended','closed','abandoned','completed','paused','in_progress')
        NOT NULL DEFAULT 'active'
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        DROP COLUMN template_snapshot_hash,
        DROP COLUMN template_snapshot,
        DROP COLUMN template_version_id,
        DROP COLUMN template_family_id
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_templates
        DROP INDEX uq_template_family_version,
        DROP COLUMN content_hash,
        DROP COLUMN retired_at,
        DROP COLUMN published_at,
        DROP COLUMN lifecycle_status,
        DROP COLUMN family_id
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_templates
        ADD UNIQUE KEY uq_template_tenant_name (tenant_id, name)
    `);
  }
}
