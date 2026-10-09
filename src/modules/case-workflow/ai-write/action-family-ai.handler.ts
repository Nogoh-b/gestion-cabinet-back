import { Injectable, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class ActionFamilyAiWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly catalogService: ActionCatalogService,
  ) {
    super('case_action_families', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    return [
      {
        name: 'code',
        label: 'Code de la famille',
        type: 'string',
        required: false,
        description:
          'Code métier stable (ex: FORMALITES). OPTIONNEL : ne le mets que si l’utilisateur l’impose, sinon OMETS-LE — il est généré automatiquement depuis le libellé. Clé JSON exacte : "code".',
        example: 'FORMALITES',
      },
      {
        name: 'label',
        label: 'Famille',
        type: 'string',
        required: true,
        description:
          'OBLIGATOIRE. Nom lisible de la famille d’actions. Clé JSON exacte : "label" (minuscules, sans accent). N’utilise JAMAIS "Famille", "famille", "nom" ou "name" comme clé — seul "label" est accepté. Valeur = le nom donné par l’utilisateur (ex: "Recouvrement amiable"). Si l’utilisateur dit juste « ajouter une famille X », mets X dans "label".',
        example: 'Formalités',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'string',
        required: false,
        description:
          'Description fonctionnelle de la famille. Clé JSON exacte : "description". Optionnel.',
        example: 'Formalités administratives et procédurales',
      },
      {
        name: 'display_order',
        label: 'Ordre d’affichage',
        type: 'number',
        required: false,
        description:
          'Position dans le catalogue. Clé JSON exacte : "display_order". Optionnel.',
        example: '1',
      },
      {
        name: 'is_active',
        label: 'Famille active',
        type: 'boolean',
        required: false,
        description:
          'Indique si cette famille est proposée. Clé JSON exacte : "is_active". Optionnel, défaut true.',
        example: 'true',
      },
    ];
  }

  /**
   * Normalise les clés envoyées par le LLM (insensible à la casse et aux
   * alias français) vers les noms techniques attendus.
   * Sans ça, un plan avec {"Famille": "X"} ou {"nom": "X"} est filtré puis
   * rejeté avec « Le champ "Famille" (label) est requis ».
   */
  private normalizeKeys(fields: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...fields };
    const pick = (...names: string[]): string | undefined =>
      Object.keys(out).find((k) => names.includes(k.toLowerCase().trim()));
    const LABEL_ALIASES = [
      'label',
      'famille',
      'famille_label',
      'family',
      'family_label',
      'nom',
      'name',
      'title',
      'titre',
      'libelle',
      'libellé',
      'intitule',
      'intitulé',
    ];
    const CODE_ALIASES = [
      'code',
      'code_famille',
      'code_famille_action',
      'family_code',
      'code_family',
    ];
    const DESC_ALIASES = ['description', 'desc'];
    const ORDER_ALIASES = [
      'display_order',
      'displayorder',
      'ordre',
      'ordre_affichage',
      'order',
    ];
    const ACTIVE_ALIASES = ['is_active', 'isactive', 'active', 'actif', 'active_flag'];
    const labelKey = pick(...LABEL_ALIASES);
    if (labelKey && labelKey !== 'label') {
      if (out.label === undefined) out.label = out[labelKey];
      delete out[labelKey];
    }
    const codeKey = pick(...CODE_ALIASES);
    if (codeKey && codeKey !== 'code') {
      if (out.code === undefined) out.code = out[codeKey];
      delete out[codeKey];
    }
    const descKey = pick(...DESC_ALIASES);
    if (descKey && descKey !== 'description') {
      if (out.description === undefined) out.description = out[descKey];
      delete out[descKey];
    }
    const orderKey = pick(...ORDER_ALIASES);
    if (orderKey && orderKey !== 'display_order') {
      if (out.display_order === undefined) out.display_order = out[orderKey];
      delete out[orderKey];
    }
    const activeKey = pick(...ACTIVE_ALIASES);
    if (activeKey && activeKey !== 'is_active') {
      if (out.is_active === undefined) out.is_active = out[activeKey];
      delete out[activeKey];
    }
    return out;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const normalized = this.normalizeKeys(fields);
    const errors: string[] = [];
    if (operation === 'INSERT' && !this.nonEmpty(normalized.label)) {
      errors.push(
        'Le champ "Famille" (label) est requis : fournis "label" avec le nom de la famille (ex: {"label": "Recouvrement amiable"}). Clé exacte "label" en minuscules — pas "Famille", "nom" ou "name".',
      );
    }
    return {
      valid: errors.length === 0,
      errors,
      transformedFields: normalized,
    };
  }

  private nonEmpty(value: any): boolean {
    return (
      value !== undefined &&
      value !== null &&
      String(value).trim().length > 0
    );
  }

  /**
   * Accepte les labels avec espaces superflus : « Famille  X » → « X ».
   * Normalise aussi les booléens/entiers fournis en chaîne par le LLM
   * ("true", "1"…) pour éviter les erreurs de validation TypeORM.
   */
  private normalizeValues(fields: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...fields };
    for (const key of ['label', 'code', 'description'] as const) {
      if (out[key] !== undefined && out[key] !== null) {
        out[key] = String(out[key]).trim();
        if (out[key] === '') delete out[key];
      }
    }
    if (out.display_order !== undefined) {
      const n = Number(out.display_order);
      if (Number.isFinite(n)) out.display_order = Math.trunc(n);
      else delete out.display_order;
    }
    if (out.is_active !== undefined && typeof out.is_active !== 'boolean') {
      const v = String(out.is_active).trim().toLowerCase();
      if (['true', '1', 'oui', 'yes', 'actif', 'active'].includes(v))
        out.is_active = true;
      else if (['false', '0', 'non', 'no', 'inactif', 'inactive'].includes(v))
        out.is_active = false;
      else delete out.is_active;
    }
    return out;
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const normalized = this.normalizeValues(this.normalizeKeys(fields));
    if (!this.nonEmpty(normalized.label)) {
      throw new BadRequestException(
        'Le champ "Famille" (label) est requis : fournis "label" avec le nom de la famille (ex: {"label": "Recouvrement amiable"}).',
      );
    }
    const family = await this.catalogService.createFamily({
      code: this.nonEmpty(normalized.code)
        ? String(normalized.code).trim()
        : undefined,
      label: String(normalized.label).trim(),
      description: this.nonEmpty(normalized.description)
        ? String(normalized.description).trim()
        : undefined,
      display_order:
        normalized.display_order !== undefined
          ? Number(normalized.display_order)
          : undefined,
      is_active:
        normalized.is_active !== undefined
          ? Boolean(normalized.is_active)
          : undefined,
    });
    return {
      success: true,
      operation: 'INSERT',
      entityId: family.id,
      affected: 1,
      data: family,
      message: `Famille "${family.label}" (${family.code}) créée avec succès`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const normalized = this.normalizeValues(this.normalizeKeys(fields));
    const family = await this.catalogService.updateFamily(String(entityId), {
      code: this.nonEmpty(normalized.code)
        ? String(normalized.code).trim()
        : undefined,
      label: this.nonEmpty(normalized.label)
        ? String(normalized.label).trim()
        : undefined,
      description:
        normalized.description !== undefined
          ? String(normalized.description ?? '').trim() || null
          : undefined,
      display_order:
        normalized.display_order !== undefined
          ? Number(normalized.display_order)
          : undefined,
      is_active:
        normalized.is_active !== undefined
          ? Boolean(normalized.is_active)
          : undefined,
    });
    return {
      success: true,
      operation: 'UPDATE',
      entityId: family.id,
      affected: 1,
      data: family,
      message: `Famille "${family.label}" mise à jour`,
    };
  }
}
