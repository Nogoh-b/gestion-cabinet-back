import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
          'Code métier stable (ex: FORMALITES, AUDIENCE). Optionnel : généré automatiquement depuis le libellé si absent.',
        example: 'FORMALITES',
      },
      {
        name: 'label',
        label: 'Famille',
        type: 'string',
        required: true,
        description: 'Nom lisible de la famille d’actions',
        example: 'Formalités',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'string',
        required: false,
        description: 'Description fonctionnelle de la famille',
        example: 'Formalités administratives et procédurales',
      },
      {
        name: 'display_order',
        label: 'Ordre d’affichage',
        type: 'number',
        required: false,
        description: 'Position dans le catalogue',
        example: '1',
      },
      {
        name: 'is_active',
        label: 'Famille active',
        type: 'boolean',
        required: false,
        description: 'Indique si cette famille est proposée',
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
      errors.push('Le champ "Famille" (label) est requis');
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const family = await this.catalogService.createFamily({
      code: fields.code?.toString().trim() || undefined,
      label: fields.label.trim(),
      description: fields.description?.toString().trim() || undefined,
      display_order:
        fields.display_order !== undefined
          ? Number(fields.display_order)
          : undefined,
      is_active:
        fields.is_active !== undefined ? Boolean(fields.is_active) : undefined,
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
    const family = await this.catalogService.updateFamily(String(entityId), {
      code: fields.code?.toString().trim() || undefined,
      label: fields.label?.toString().trim() || undefined,
      description:
        fields.description !== undefined
          ? fields.description?.toString().trim() || null
          : undefined,
      display_order:
        fields.display_order !== undefined
          ? Number(fields.display_order)
          : undefined,
      is_active:
        fields.is_active !== undefined ? Boolean(fields.is_active) : undefined,
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
