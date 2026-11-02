import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectPublishedProcedureTemplates1785169014000
  implements MigrationInterface
{
  name = 'ProtectPublishedProcedureTemplates1785169014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER trg_procedure_templates_immutable_update
      BEFORE UPDATE ON procedure_templates
      FOR EACH ROW
      BEGIN
        IF OLD.lifecycle_status = 'RETIRED'
           AND NEW.lifecycle_status <> OLD.lifecycle_status THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A retired procedure template is immutable';
        END IF;
        IF OLD.lifecycle_status = 'PUBLISHED'
           AND NEW.lifecycle_status NOT IN ('PUBLISHED', 'RETIRED') THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A published procedure template cannot return to draft';
        END IF;
        IF OLD.lifecycle_status IN ('PUBLISHED', 'RETIRED')
           AND (
             NOT (NEW.family_id <=> OLD.family_id)
             OR NOT (NEW.name <=> OLD.name)
             OR NOT (NEW.description <=> OLD.description)
             OR NOT (NEW.version <=> OLD.version)
             OR NOT (NEW.published_at <=> OLD.published_at)
             OR NOT (NEW.content_hash <=> OLD.content_hash)
             OR NOT (NEW.tenant_id <=> OLD.tenant_id)
           ) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Published procedure template content is immutable';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_procedure_templates_immutable_delete
      BEFORE DELETE ON procedure_templates
      FOR EACH ROW
      BEGIN
        IF OLD.lifecycle_status <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Only draft procedure templates can be deleted';
        END IF;
      END
    `);

    await this.createDirectChildTriggers(
      queryRunner,
      'stages',
      'templateId',
      'stages',
    );
    await this.createDirectChildTriggers(
      queryRunner,
      'transitions',
      'templateId',
      'transitions',
    );
    await this.createDirectChildTriggers(
      queryRunner,
      'cycles',
      'templateId',
      'cycles',
    );
    await this.createStageChildTriggers(
      queryRunner,
      'sub_stages',
      'stageId',
      'sub_stages',
    );
    await this.createStageChildTriggers(
      queryRunner,
      'stage_configs',
      'stageId',
      'stage_configs',
    );
  }

  private async createDirectChildTriggers(
    queryRunner: QueryRunner,
    table: string,
    templateColumn: string,
    suffix: string,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_insert
      BEFORE INSERT ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT lifecycle_status FROM procedure_templates
          WHERE id = NEW.${templateColumn} LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Procedure template children require a draft version';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT lifecycle_status FROM procedure_templates
          WHERE id = OLD.${templateColumn} LIMIT 1
        ), 'MISSING') <> 'DRAFT'
        OR COALESCE((
          SELECT lifecycle_status FROM procedure_templates
          WHERE id = NEW.${templateColumn} LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Published procedure template children are immutable';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_delete
      BEFORE DELETE ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT lifecycle_status FROM procedure_templates
          WHERE id = OLD.${templateColumn} LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Published procedure template children are immutable';
        END IF;
      END
    `);
  }

  private async createStageChildTriggers(
    queryRunner: QueryRunner,
    table: string,
    stageColumn: string,
    suffix: string,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_insert
      BEFORE INSERT ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT template.lifecycle_status
          FROM stages stage
          INNER JOIN procedure_templates template ON template.id = stage.templateId
          WHERE stage.id = NEW.${stageColumn}
          LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Procedure template children require a draft version';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_update
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT template.lifecycle_status
          FROM stages stage
          INNER JOIN procedure_templates template ON template.id = stage.templateId
          WHERE stage.id = OLD.${stageColumn}
          LIMIT 1
        ), 'MISSING') <> 'DRAFT'
        OR COALESCE((
          SELECT template.lifecycle_status
          FROM stages stage
          INNER JOIN procedure_templates template ON template.id = stage.templateId
          WHERE stage.id = NEW.${stageColumn}
          LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Published procedure template children are immutable';
        END IF;
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_${suffix}_draft_delete
      BEFORE DELETE ON ${table}
      FOR EACH ROW
      BEGIN
        IF COALESCE((
          SELECT template.lifecycle_status
          FROM stages stage
          INNER JOIN procedure_templates template ON template.id = stage.templateId
          WHERE stage.id = OLD.${stageColumn}
          LIMIT 1
        ), 'MISSING') <> 'DRAFT' THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Published procedure template children are immutable';
        END IF;
      END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const triggerNames = [
      'trg_stage_configs_draft_delete',
      'trg_stage_configs_draft_update',
      'trg_stage_configs_draft_insert',
      'trg_sub_stages_draft_delete',
      'trg_sub_stages_draft_update',
      'trg_sub_stages_draft_insert',
      'trg_cycles_draft_delete',
      'trg_cycles_draft_update',
      'trg_cycles_draft_insert',
      'trg_transitions_draft_delete',
      'trg_transitions_draft_update',
      'trg_transitions_draft_insert',
      'trg_stages_draft_delete',
      'trg_stages_draft_update',
      'trg_stages_draft_insert',
      'trg_procedure_templates_immutable_delete',
      'trg_procedure_templates_immutable_update',
    ];
    for (const triggerName of triggerNames) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS ${triggerName}`);
    }
  }
}
