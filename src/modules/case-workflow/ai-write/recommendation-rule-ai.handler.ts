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
        description:
          'OBLIGATOIRE. Code métier unique de la règle (MAJUSCULES, chiffres, underscores). Clé JSON exacte : "code". Contrairement aux familles et définitions, le code N’EST PAS généré automatiquement — tu dois le déduire du libellé (ex: "Audience proche" → "AUDIENCE_PROCHE").',
        example: 'AUDIENCE_DUE_SOON',
      },
      {
        name: 'label',
        label: 'Libellé',
        type: 'string',
        required: true,
        description:
          'OBLIGATOIRE. Nom lisible de la règle. Clé JSON exacte : "label" (minuscules). N’utilise JAMAIS "Libellé", "nom" ou "name" comme clé — seul "label" est accepté.',
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
          'OBLIGATOIRE. Condition json-logic de déclenchement. Clé JSON exacte : "condition_json". Accepte un objet ou sa forme texte. Ex: {"<=":[{"var":"audiences.nextInDays"},7]}',
        example: '{"<=":[{"var":"audiences.nextInDays"},7]}',
      },
      {
        name: 'reason_template',
        label: 'Motif affiché',
        type: 'string',
        required: true,
        description:
          'OBLIGATOIRE. Phrase affichée à l’utilisateur quand la règle s’applique. Clé JSON exacte : "reason_template".',
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
    const normalized = this.normalizeKeys(fields);
    const errors: string[] = [];
    if (operation === 'INSERT') {
      if (!this.nonEmpty(normalized.code))
        errors.push(
          'Le code est requis : fournis "code" en MAJUSCULES (ex: {"code": "AUDIENCE_PROCHE"}).',
        );
      if (!this.nonEmpty(normalized.label))
        errors.push(
          'Le libellé est requis : fournis "label" avec le nom lisible (ex: {"label": "Audience proche"}). Clé exacte "label", pas "Libellé" ni "nom".',
        );
      if (!this.nonEmpty(normalized.trigger))
        errors.push('Le déclencheur (trigger) est requis');
      if (
        !this.nonEmpty(normalized.condition_json) &&
        !this.nonEmpty(normalized.conditionJson)
      )
        errors.push(
          'La condition (condition_json) est requise : fournis un objet json-logic (ex: {"condition_json": {"<=": [{"var": "audiences.nextInDays"}, 7]}}).',
        );
      if (!this.nonEmpty(normalized.reason_template))
        errors.push(
          'Le motif (reason_template) est requis : phrase affichée à l’utilisateur.',
        );
      if (
        !this.nonEmpty(normalized.action_definition_id) &&
        !this.nonEmpty(normalized.action_definition) &&
        !this.nonEmpty(normalized.definition_code)
      )
        errors.push(
          'La définition d’action est requise : fournis action_definition_id (UUID) ou action_definition / definition_code avec le code ou libellé.',
        );
    }
    return {
      valid: errors.length === 0,
      errors,
      transformedFields: normalized,
    };
  }

  /**
   * Normalise les clés envoyées par le LLM (casse, accents, alias français)
   * vers les noms techniques attendus.
   */
  private normalizeKeys(fields: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...fields };
    const pick = (...names: string[]): string | undefined =>
      Object.keys(out).find((k) => names.includes(k.toLowerCase().trim()));
    const move = (from: string | undefined, to: string) => {
      if (from && from !== to) {
        if (out[to] === undefined) out[to] = out[from];
        delete out[from];
      }
    };
    move(
      pick('label', 'libelle', 'libellé', 'nom', 'name', 'title', 'titre'),
      'label',
    );
    move(pick('code', 'code_regle', 'rule_code'), 'code');
    move(pick('trigger', 'declencheur', 'déclencheur', 'evenement', 'événement'), 'trigger');
    move(
      pick(
        'condition_json',
        'conditionjson',
        'condition',
        'condition-json',
        'condition_logique',
      ),
      'condition_json',
    );
    move(
      pick(
        'reason_template',
        'reasontemplate',
        'motif',
        'motif_affiche',
        'message',
        'phrase',
      ),
      'reason_template',
    );
    move(
      pick(
        'action_definition_id',
        'actiondefinitionid',
        'definition_id',
        'id_definition',
      ),
      'action_definition_id',
    );
    move(
      pick(
        'action_definition',
        'actiondefinition',
        'definition',
        'definition_code',
        'definitioncode',
      ),
      'action_definition',
    );
    return out;
  }

  private nonEmpty(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return String(value).trim().length > 0;
  }

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: import('src/core/ai-database/write/entity-resolver.service').ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = { ...this.normalizeKeys(fields) };
    // Nettoyer les textes (espaces) avant résolution ; une valeur vide ne
    // doit jamais partir au resolver — validateFields produira le message.
    for (const key of [
      'code',
      'label',
      'trigger',
      'action_definition',
      'action_definition_id',
      'reason_template',
    ] as const) {
      if (resolved[key] !== undefined && resolved[key] !== null) {
        if (typeof resolved[key] === 'string') {
          const trimmed = resolved[key].trim();
          if (trimmed === '') delete resolved[key];
          else resolved[key] = trimmed;
        }
      }
    }
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
    const normalized = this.normalizeKeys(fields);
    if (!this.nonEmpty(normalized.code)) {
      throw new Error(
        'Le code est requis : fournis "code" en MAJUSCULES (ex: {"code": "AUDIENCE_PROCHE"}).',
      );
    }
    if (!this.nonEmpty(normalized.label)) {
      throw new Error(
        'Le libellé est requis : fournis "label" avec le nom lisible (ex: {"label": "Audience proche"}).',
      );
    }
    if (!this.nonEmpty(normalized.action_definition_id)) {
      throw new Error(
        'La définition d’action est requise : fournis action_definition_id (UUID) ou action_definition avec le code/libellé.',
      );
    }
    const rule = await this.catalogService.createRecommendationRule({
      code: String(normalized.code).trim(),
      label: String(normalized.label).trim(),
      trigger: normalized.trigger,
      action_definition_id: String(normalized.action_definition_id).trim(),
      condition_json: normalized.condition_json,
      reason_template: String(normalized.reason_template).trim(),
      priority:
        normalized.priority !== undefined
          ? Number(normalized.priority)
          : undefined,
      specificity:
        normalized.specificity !== undefined
          ? Number(normalized.specificity)
          : undefined,
      due_offset_days:
        normalized.due_offset_days !== undefined
          ? Number(normalized.due_offset_days)
          : undefined,
      is_active:
        normalized.is_active !== undefined
          ? this.toBoolean(normalized.is_active)
          : undefined,
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
    if (fields.is_active !== undefined) patch.is_active = this.toBoolean(fields.is_active);
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

  /**
   * Convertit les booléens fournis en chaîne par le LLM ("true", "1", "oui"…).
   * Boolean("false") === true, d'où la nécessité de ce helper.
   */
  private toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const v = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'oui', 'yes', 'y', 'actif', 'active'].includes(v))
      return true;
    if (['false', '0', 'non', 'no', 'n', 'inactif', 'inactive'].includes(v))
      return false;
    return true;
  }
}
