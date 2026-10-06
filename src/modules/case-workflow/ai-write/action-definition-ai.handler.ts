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
export class ActionDefinitionAiWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly catalogService: ActionCatalogService,
  ) {
    super('case_action_definitions', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    return [
      {
        name: 'family_id',
        label: 'Famille d’actions',
        type: 'reference',
        required: false,
        referenceEntity: 'case_action_families',
        description:
          'ID de la famille. Tu peux aussi fournir "family" avec le code ou le libellé (résolu automatiquement).',
        example: 'FORMALITES',
      },
      {
        name: 'family',
        label: 'Famille (par nom/code)',
        type: 'string',
        required: false,
        referenceEntity: 'case_action_families',
        description:
          'Code ou libellé de la famille. Si la famille n’existe pas elle sera créée automatiquement.',
        example: 'Formalités',
      },
      {
        name: 'code',
        label: 'Code de l’action',
        type: 'string',
        required: false,
        description:
          'Code métier stable. Optionnel : généré automatiquement depuis le libellé si absent.',
        example: 'SIGN_DOCUMENT',
      },
      {
        name: 'label',
        label: 'Libellé de l’action',
        type: 'string',
        required: true,
        description: 'Nom lisible proposé lors de la création d’une action.',
        example: 'Faire signer le document',
      },
      {
        name: 'default_due_days',
        label: 'Délai par défaut',
        type: 'number',
        required: false,
        description: 'Nombre de jours proposé pour l’échéance.',
        example: '5',
      },
      {
        name: 'default_priority',
        label: 'Priorité par défaut',
        type: 'enum',
        required: false,
        enumValues: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
        description: 'LOW, NORMAL, HIGH ou CRITICAL.',
        example: 'NORMAL',
      },
      {
        name: 'default_professional_treatment',
        label: 'Traitement professionnel',
        type: 'enum',
        required: false,
        enumValues: [
          'FOLLOW_DOSSIER',
          'HOURLY',
          'VACATION',
          'NON_BILLABLE',
          'NEEDS_REVIEW',
        ],
        description:
          'FOLLOW_DOSSIER=suivre honoraires dossier, HOURLY=horaire, VACATION=vacation, NON_BILLABLE=non facturable, NEEDS_REVIEW=à vérifier.',
        example: 'FOLLOW_DOSSIER',
      },
      {
        name: 'billable_by_default',
        label: 'Facturable par défaut',
        type: 'boolean',
        required: false,
        description: 'Valeur proposée à la création seulement.',
        example: 'false',
      },
      {
        name: 'billing_mode',
        label: 'Mode de calcul',
        type: 'enum',
        required: false,
        enumValues: ['FIXED', 'HOURLY', 'PERCENTAGE', 'EXPENSE', 'UNIT', 'ACTUAL_COST'],
        description: 'FIXED, HOURLY, PERCENTAGE, EXPENSE…',
        example: 'FIXED',
      },
      {
        name: 'default_rate',
        label: 'Tarif par défaut',
        type: 'number',
        required: false,
        description: 'Tarif proposé lorsque aucune règle dossier ne s’applique.',
        example: '50000',
      },
      {
        name: 'may_have_expenses',
        label: 'Frais possibles',
        type: 'boolean',
        required: false,
        description: 'Affiche un raccourci de saisie de frais',
        example: 'false',
      },
      {
        name: 'may_have_disbursements',
        label: 'Débours possibles',
        type: 'boolean',
        required: false,
        description: 'Affiche un raccourci de saisie de débours',
        example: 'false',
      },
      {
        name: 'is_required',
        label: 'Obligatoire par défaut',
        type: 'boolean',
        required: false,
        description: 'Indique si les nouvelles actions de ce type sont obligatoires',
        example: 'false',
      },
      {
        name: 'allowed_results',
        label: 'Résultats autorisés',
        type: 'string',
        required: false,
        description:
          'JSON array des résultats possibles à la clôture. Ex: [{"code":"COMPLETED","label":"Réalisée"}]',
        example: '[{"code":"COMPLETED","label":"Action réalisée"}]',
      },
      {
        name: 'specific_fields_schema',
        label: 'Champs spécifiques',
        type: 'string',
        required: false,
        description: 'JSON schema des informations propres à ce type d’action',
        example: '{"type":"object","properties":{}}',
      },
      {
        name: 'required_relations',
        label: 'Relations requises',
        type: 'string',
        required: false,
        description: 'JSON des documents/audiences/actions à lier',
        example: '{"audiences":{"min":1}}',
      },
      {
        name: 'is_active',
        label: 'Définition active',
        type: 'boolean',
        required: false,
        description: 'Indique si cette version peut encore être utilisée',
        example: 'true',
      },
    ];
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    if (operation === 'INSERT' && !fields.label) {
      errors.push('Le champ "Libellé de l’action" (label) est requis');
    }
    if (
      operation === 'INSERT' &&
      !fields.family_id &&
      !fields.family
    ) {
      errors.push(
        'La famille est requise : fournir soit family_id soit family (code/libellé)',
      );
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
    if (!resolved.family_id && resolved.family) {
      const term = String(resolved.family).trim();
      // Ne pas passer un UUID déjà résolu au resolver — sinon on chercherait un nom qui vaut l'UUID
      if (!BaseWriteHandler.isAlreadyId(term)) {
        const result = await this.entityResolver.resolveOrCreateEntity(
          'case_action_families',
          term,
          userId,
          undefined,
          config,
        );
        if (result.resolved.found && result.resolved.best && !result.resolved.ambiguous) {
          resolved.family_id = result.resolved.best.id;
          if (result.created && result.newEntity && createdEntities) {
            createdEntities.set(
              `auto_case_action_families_${result.newEntity.id}`,
              result.newEntity,
            );
          }
          this.logger.log(`✅ family "${term}" → ${resolved.family_id}`);
        } else if (result.resolved.ambiguous) {
          throw new AmbiguityException(
            'case_action_families',
            'family',
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
      } else {
        resolved.family_id = term;
      }
      delete resolved.family;
    } else if (resolved.family) {
      delete resolved.family;
    }
    // Laisser BaseWriteHandler gérer le reste (s'il en reste) — mais on a déjà traité family
    // On ne doit pas rappeler super.resolveDependencies qui re-traiterait family_id comme FK texte
    return resolved;
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const def = await this.catalogService.createDefinition({
      family_id: fields.family_id,
      code: fields.code?.toString().trim() || undefined,
      label: fields.label.trim(),
      default_due_days:
        fields.default_due_days !== undefined
          ? Number(fields.default_due_days)
          : undefined,
      default_priority: fields.default_priority || undefined,
      default_professional_treatment:
        fields.default_professional_treatment || undefined,
      billable_by_default:
        fields.billable_by_default !== undefined
          ? Boolean(fields.billable_by_default)
          : undefined,
      billing_mode: fields.billing_mode || undefined,
      default_rate:
        fields.default_rate !== undefined ? Number(fields.default_rate) : undefined,
      may_have_expenses:
        fields.may_have_expenses !== undefined
          ? Boolean(fields.may_have_expenses)
          : undefined,
      may_have_disbursements:
        fields.may_have_disbursements !== undefined
          ? Boolean(fields.may_have_disbursements)
          : undefined,
      is_required:
        fields.is_required !== undefined
          ? Boolean(fields.is_required)
          : undefined,
      allowed_results: this.parseJson(fields.allowed_results),
      specific_fields_schema: this.parseJson(fields.specific_fields_schema),
      required_relations: this.parseJson(fields.required_relations),
    } as any);
    return {
      success: true,
      operation: 'INSERT',
      entityId: def.id,
      affected: 1,
      data: def,
      message: `Définition "${def.label}" (${def.code} v${def.version}) créée`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const def = await this.catalogService.reviseDefinition(String(entityId), {
      family_id: fields.family_id || undefined,
      label: fields.label?.toString().trim() || undefined,
      default_due_days:
        fields.default_due_days !== undefined
          ? Number(fields.default_due_days)
          : undefined,
      default_priority: fields.default_priority || undefined,
      default_professional_treatment:
        fields.default_professional_treatment || undefined,
      billable_by_default:
        fields.billable_by_default !== undefined
          ? Boolean(fields.billable_by_default)
          : undefined,
      billing_mode: fields.billing_mode || undefined,
      default_rate:
        fields.default_rate !== undefined ? Number(fields.default_rate) : undefined,
      may_have_expenses:
        fields.may_have_expenses !== undefined
          ? Boolean(fields.may_have_expenses)
          : undefined,
      may_have_disbursements:
        fields.may_have_disbursements !== undefined
          ? Boolean(fields.may_have_disbursements)
          : undefined,
      is_required:
        fields.is_required !== undefined
          ? Boolean(fields.is_required)
          : undefined,
      allowed_results: this.parseJson(fields.allowed_results),
      specific_fields_schema: this.parseJson(fields.specific_fields_schema),
      required_relations: this.parseJson(fields.required_relations),
      is_active:
        fields.is_active !== undefined ? Boolean(fields.is_active) : undefined,
    } as any);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: def.id,
      affected: 1,
      data: def,
      message: `Définition "${def.label}" révisée → v${def.version}`,
    };
  }

  private parseJson(value: any): any {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
}
