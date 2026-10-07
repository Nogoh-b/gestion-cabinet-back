import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';
import { ActionCatalogService } from '../services/action-catalog.service';
import { AmbiguityException } from 'src/core/ai-database/write/ambiguity.exception';

@Injectable()
export class RecommendationRuleAiWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly catalogService: ActionCatalogService,
  ) {
    super('case_recommendation_rules', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    return [
      {
        name: 'code',
        label: 'Code de la règle',
        type: 'string',
        required: true,
        description: 'Code métier unique de la règle',
        example: 'AUDIENCE_DUE_SOON',
      },
      {
        name: 'label',
        label: 'Libellé',
        type: 'string',
        required: true,
        description: 'Nom lisible de la règle',
        example: 'Audience proche',
      },
      {
        name: 'trigger',
        label: 'Déclencheur',
        type: 'enum',
        required: true,
        enumValues: [
          'OPENING_VALIDATED',
          'ACTION_COMPLETED',
          'AUDIENCE_DUE',
          'AUDIENCE_POSTPONED',
          'DOCUMENT_STATUS_CHANGED',
          'MISSING_DOCUMENT',
          'DEADLINE_REACHED',
          'NO_OPEN_ACTION',
          'MANUAL',
        ],
        description: 'Événement déclencheur',
        example: 'AUDIENCE_DUE',
      },
      {
        name: 'action_definition_id',
        label: 'Définition d’action recommandée',
        type: 'reference',
        required: true,
        referenceEntity: 'case_action_definitions',
        description:
          'UUID de la définition. Tu peux aussi fournir action_definition ou definition_code avec le code métier.',
        example: 'PREPARE_HEARING',
      },
      {
        name: 'action_definition',
        label: 'Définition (par code/label)',
        type: 'string',
        required: false,
        referenceEntity: 'case_action_definitions',
        description:
          'Code ou libellé de la définition d’action à recommander. Résolu automatiquement.',
        example: 'Préparer une audience',
      },
      {
        name: 'condition_json',
        label: 'Condition json-logic',
        type: 'string',
        required: true,
        description:
          'Condition json-logic. Ex: {"<=":[{"var":"audiences.nextInDays"},7]}',
        example: '{"<=":[{"var":"audiences.nextInDays"},7]}',
      },
      {
        name: 'reason_template',
        label: 'Motif affiché',
        type: 'string',
        required: true,
        description: 'Phrase affichée à l’utilisateur quand la règle s’applique',
        example: 'Une audience est prévue dans les 7 jours.',
      },
      {
        name: 'priority',
        label: 'Priorité',
        type: 'number',
        required: false,
        description: '0–100',
        example: '90',
      },
      {
        name: 'specificity',
        label: 'Spécificité',
        type: 'number',
        required: false,
        description: '0–100',
        example: '85',
      },
      {
        name: 'due_offset_days',
        label: 'Décalage échéance (jours)',
        type: 'number',
        required: false,
        description: 'Offset en jours pour due_at',
        example: '3',
      },
      {
        name: 'is_active',
        label: 'Active',
        type: 'boolean',
        required: false,
        description: 'Indique si la règle est active',
        example: 'true',
      },
    ];
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    if (operation === 'INSERT') {
      if (!fields.code) errors.push('Le code est requis');
      if (!fields.label) errors.push('Le libellé est requis');
      if (!fields.trigger) errors.push('Le déclencheur (trigger) est requis');
      if (!fields.condition_json && !fields.conditionJson)
        errors.push('La condition (condition_json) est requise');
      if (!fields.reason_template) errors.push('Le motif (reason_template) est requis');
      if (!fields.action_definition_id && !fields.action_definition && !fields.definition_code)
        errors.push('La définition d’action est requise (action_definition_id ou action_definition)');
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: import('src/core/ai-database/write/entity-resolver.service').ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = { ...fields };
    // Alias: action_definition / definition_code -> action_definition_id
    const aliasVal =
      resolved.action_definition ?? resolved.definition_code ?? resolved.definitionCode;
    if (!resolved.action_definition_id && aliasVal) {
      const term = String(aliasVal).trim();
      if (BaseWriteHandler.isAlreadyId(term)) {
        resolved.action_definition_id = term;
      } else {
        const result = await this.entityResolver.resolveOrCreateEntity(
          'case_action_definitions',
          term,
          userId,
          undefined,
          config,
        );
        if (result.resolved.found && result.resolved.best && !result.resolved.ambiguous) {
          resolved.action_definition_id = result.resolved.best.id;
          if (result.created && result.newEntity && createdEntities) {
            createdEntities.set(
              `auto_case_action_definitions_${result.newEntity.id}`,
              result.newEntity,
            );
          }
          this.logger.log(`✅ action_definition "${term}" → ${resolved.action_definition_id}`);
        } else if (result.resolved.ambiguous || result.resolved.candidates.length > 0) {
          throw new AmbiguityException(
            'case_action_definitions',
            'action_definition',
            term,
            result.resolved.candidates.slice(0, 10).map((c: any) => ({
              id: c.entity.id,
              label: c.matchedOn,
              score: c.score,
              data: c.entity,
            })),
            -1,
            this.entityName,
          );
        }
      }
      delete resolved.action_definition;
      delete resolved.definition_code;
      delete resolved.definitionCode;
    }
    if (resolved.action_definition !== undefined) delete resolved.action_definition;
    if (resolved.definition_code !== undefined) delete resolved.definition_code;
    // JSON string -> object pour condition
    if (typeof resolved.condition_json === 'string') {
      try {
        resolved.condition_json = JSON.parse(resolved.condition_json);
      } catch {
        /* laisser tel quel — le service validera */
      }
    }
    return resolved;
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const rule = await this.catalogService.createRecommendationRule({
      code: fields.code.trim(),
      label: fields.label.trim(),
      trigger: fields.trigger,
      action_definition_id: fields.action_definition_id,
      condition_json: fields.condition_json,
      reason_template: fields.reason_template.trim(),
      priority:
        fields.priority !== undefined ? Number(fields.priority) : undefined,
      specificity:
        fields.specificity !== undefined ? Number(fields.specificity) : undefined,
      due_offset_days:
        fields.due_offset_days !== undefined
          ? Number(fields.due_offset_days)
          : undefined,
      is_active:
        fields.is_active !== undefined ? Boolean(fields.is_active) : undefined,
    } as any);
    return {
      success: true,
      operation: 'INSERT',
      entityId: rule.id,
      affected: 1,
      data: rule,
      message: `Règle "${rule.label}" (${rule.code} v${rule.version}) créée`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    // reviseRecommendationRule expects expected_version; fetch current to avoid conflict if not provided
    const current = await this.dataSource
      .getRepository('case_recommendation_rules')
      .findOne({ where: { id: String(entityId) } } as any);
    const expected_version =
      fields.expected_version !== undefined
        ? Number(fields.expected_version)
        : current?.version ?? 1;
    const patch: any = {
      expected_version,
    };
    if (fields.label !== undefined) patch.label = String(fields.label).trim();
    if (fields.trigger !== undefined) patch.trigger = fields.trigger;
    if (fields.action_definition_id !== undefined)
      patch.action_definition_id = fields.action_definition_id;
    if (fields.condition_json !== undefined)
      patch.condition_json =
        typeof fields.condition_json === 'string'
          ? JSON.parse(fields.condition_json)
          : fields.condition_json;
    if (fields.reason_template !== undefined)
      patch.reason_template = String(fields.reason_template).trim();
    if (fields.priority !== undefined) patch.priority = Number(fields.priority);
    if (fields.specificity !== undefined) patch.specificity = Number(fields.specificity);
    if (fields.due_offset_days !== undefined)
      patch.due_offset_days = Number(fields.due_offset_days);
    if (fields.is_active !== undefined) patch.is_active = Boolean(fields.is_active);
    const rule = await this.catalogService.reviseRecommendationRule(
      String(entityId),
      patch,
    );
    return {
      success: true,
      operation: 'UPDATE',
      entityId: rule.id,
      affected: 1,
      data: rule,
      message: `Règle "${rule.label}" révisée → v${rule.version}`,
    };
  }
}
