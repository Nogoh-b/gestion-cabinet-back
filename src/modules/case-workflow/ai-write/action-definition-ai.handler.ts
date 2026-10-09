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
          'UUID de la famille (prioritaire si fourni). Sinon fournis "family" avec le code ou le libellé (résolu automatiquement, créé si inexistant). Clés exactes : "family_id" ou "family".',
        example: 'FORMALITES',
      },
      {
        name: 'family',
        label: 'Famille (par nom/code)',
        type: 'string',
        required: false,
        referenceEntity: 'case_action_families',
        description:
          'OBLIGATOIRE si "family_id" est absent. Code ou LIBELLÉ de la famille (ex: "Formalités", "Recouvrement amiable"). Si la famille n’existe pas, elle est CRÉÉE AUTOMATIQUEMENT avec ce nom comme "label" — ne crée JAMAIS une opération case_action_families séparée pour ça. Exemple de plan minimal : {"operation":"INSERT","entity":"case_action_definitions","fields":{"label":"Relancer le débiteur","family":"Recouvrement amiable"}}.',
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
        description:
          'OBLIGATOIRE. Nom lisible de l’action. Clé JSON exacte : "label" (minuscules). N’utilise JAMAIS "Libellé", "libelle", "nom" ou "name" comme clé — seul "label" est accepté.',
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
    const normalized = this.normalizeKeys(fields);
    const errors: string[] = [];
    if (operation === 'INSERT' && !this.nonEmpty(normalized.label)) {
      errors.push(
        'Le champ "Libellé de l’action" (label) est requis : fournis "label" avec le nom de l’action (ex: {"label": "Relancer le débiteur"}).',
      );
    }
    if (
      operation === 'INSERT' &&
      !this.nonEmpty(normalized.family_id) &&
      !this.nonEmpty(normalized.family)
    ) {
      errors.push(
        'La famille est requise : fournis "family" avec le code ou le LIBELLÉ (ex: {"family": "Recouvrement amiable"}) — elle sera créée automatiquement si elle n’existe pas — ou "family_id" avec l’UUID.',
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
   * vers les noms techniques attendus. Ex : {"Libellé": "X"} → {"label": "X"},
   * {"famille": "Y"} → {"family": "Y"}.
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
      pick(
        'label',
        'libelle',
        'libellé',
        'nom',
        'name',
        'title',
        'titre',
        'intitule',
        'intitulé',
      ),
      'label',
    );
    move(
      pick(
        'family',
        'famille',
        'family_label',
        'famille_label',
        'family_name',
        'nom_famille',
      ),
      'family',
    );
    move(
      pick('family_id', 'familyid', 'famille_id', 'famille-id', 'id_famille'),
      'family_id',
    );
    move(pick('code', 'code_action'), 'code');
    return out;
  }

  private nonEmpty(value: any): boolean {
    return (
      value !== undefined &&
      value !== null &&
      String(value).trim().length > 0
    );
  }

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: import('src/core/ai-database/write/entity-resolver.service').ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = { ...this.normalizeKeys(fields) };
    // Valeurs texte avec espaces superflus : on nettoie avant résolution.
    for (const key of ['label', 'code', 'family', 'family_id'] as const) {
      if (resolved[key] !== undefined && resolved[key] !== null) {
        const trimmed = String(resolved[key]).trim();
        if (trimmed === '') delete resolved[key];
        else resolved[key] = trimmed;
      }
    }
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
    // La création automatique de famille rejette un terme vide : si "family"
    // était vide et qu'aucune famille n'est résolue, on laisse validateFields
    // produire le message actionnable plutôt qu'une erreur SQL.
    // Laisser BaseWriteHandler gérer le reste (s'il en reste) — mais on a déjà traité family
    // On ne doit pas rappeler super.resolveDependencies qui re-traiterait family_id comme FK texte
    return resolved;
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const normalized = this.normalizeKeys(fields);
    if (!this.nonEmpty(normalized.label)) {
      throw new Error(
        'Le champ "Libellé de l’action" (label) est requis : fournis "label" avec le nom de l’action (ex: {"label": "Relancer le débiteur"}).',
      );
    }
    if (!this.nonEmpty(normalized.family_id)) {
      throw new Error(
        'La famille est requise : fournis "family" avec le code ou le libellé (ex: {"family": "Recouvrement amiable"}).',
      );
    }
    const def = await this.catalogService.createDefinition({
      family_id: String(normalized.family_id).trim(),
      code: this.nonEmpty(normalized.code)
        ? String(normalized.code).trim()
        : undefined,
      label: String(normalized.label).trim(),
      default_due_days:
        normalized.default_due_days !== undefined
          ? Number(normalized.default_due_days)
          : undefined,
      default_priority: normalized.default_priority || undefined,
      default_professional_treatment:
        normalized.default_professional_treatment || undefined,
      billable_by_default:
        normalized.billable_by_default !== undefined
          ? this.toBoolean(normalized.billable_by_default)
          : undefined,
      billing_mode: normalized.billing_mode || undefined,
      default_rate:
        normalized.default_rate !== undefined
          ? Number(normalized.default_rate)
          : undefined,
      may_have_expenses:
        normalized.may_have_expenses !== undefined
          ? this.toBoolean(normalized.may_have_expenses)
          : undefined,
      may_have_disbursements:
        normalized.may_have_disbursements !== undefined
          ? this.toBoolean(normalized.may_have_disbursements)
          : undefined,
      is_required:
        normalized.is_required !== undefined
          ? this.toBoolean(normalized.is_required)
          : undefined,
      allowed_results: this.parseJson(normalized.allowed_results),
      specific_fields_schema: this.parseJson(normalized.specific_fields_schema),
      required_relations: this.parseJson(normalized.required_relations),
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

  /**
   * Convertit les booléens fournis en chaîne par le LLM ("true", "1", "oui"…)
   * en vrais booléens. Boolean("false") === true, d'où la nécessité de ce
   * helper : sans lui, "false" devenait true côté catalogue.
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
