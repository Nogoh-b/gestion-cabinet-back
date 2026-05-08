/**
 * BaseWriteHandler — Handler d'écriture générique qui fonctionne avec N'IMPORTE
 * quelle entité TypeORM décorée @BusinessTable.
 *
 * Il lit automatiquement :
 *   - TypeORM EntityMetadata → colonnes, FK, relations
 *   - @BusinessColumn → libellés, types, importance, writable/ignored
 *   - EntityResolverService → résolution texte → ID pour les FK
 *
 * Pour ajouter le support d'écriture IA à une entité, il suffit qu'elle ait
 * un @BusinessTable. Aucun code supplémentaire n'est nécessaire.
 *
 * Pour une logique métier spécifique (ex: génération de numéro de dossier),
 * créez un handler custom qui étend cette classe et surcharge les méthodes.
 */
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityMetadata, Repository } from 'typeorm';
import { EntityWriteHandler, WriteableFieldSchema, ValidationResult } from '../interface/entity-write-handler.interface';
import { WriteIntent } from '../interface/write-intent.interface';
import { WriteResult } from './write-handler.registry';
import { SchemaMetadataService } from '../schema-metadata.service';
import { EntityResolverService } from './entity-resolver.service';
import { BUSINESS_METADATA_KEY, BusinessColumnMetadata } from '../../decorators/business-metadata.decorator';

/** Colonnes système jamais modifiables par l'IA */
const SYSTEM_COLUMNS = new Set([
  'id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
  'deleted_date', 'created_by', 'updated_by',
  'password', 'token', 'secret', 'refresh_token', 'refreshToken',
]);

export class BaseWriteHandler implements EntityWriteHandler<any> {
  protected readonly logger: Logger;
  protected readonly repo: Repository<any>;
  protected readonly entityMeta: EntityMetadata;

  /** Mapping nom court → { fkColumn, referencedTable } */
  protected readonly fkMap: Map<string, { fkColumn: string; referencedTable: string }>;

  constructor(
    readonly entityName: string,
    protected readonly dataSource: DataSource,
    protected readonly schemaMetadata: SchemaMetadataService,
    protected readonly entityResolver: EntityResolverService,
  ) {
    this.logger = new Logger(`WriteHandler:${entityName}`);

    // Récupérer les métadonnées TypeORM
    const entityMetas = this.dataSource.entityMetadatas.find(
      m => m.tableName === entityName,
    );
    if (!entityMetas) {
      throw new Error(`Entité TypeORM inconnue: ${entityName}`);
    }
    this.entityMeta = entityMetas;
    this.repo = this.dataSource.getRepository(this.entityMeta.target);

    // Construire le mapping FK
    this.fkMap = this.buildFkMap();
  }

  // ─── SCHÉMA DES CHAMPS MODIFIABLES ──────────────────────────────────────────

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields: WriteableFieldSchema[] = [];
    const columnMetaMap = this.schemaMetadata.getColumnMetadataMap(this.entityName);

    for (const column of this.entityMeta.columns) {
      const dbName = column.databaseName;

      // Ignorer les colonnes système
      if (SYSTEM_COLUMNS.has(dbName)) continue;
      if (column.isPrimary && column.isGenerated) continue;

      // Vérifier les métadonnées BusinessColumn
      const bCol: BusinessColumnMetadata | undefined = columnMetaMap?.get(dbName);
      if (bCol?.ignored) continue;

      // Déterminer le type
      let fieldType: WriteableFieldSchema['type'] = 'string';
      let enumValues: string[] | undefined;
      let referenceEntity: string | undefined;

      // FK ?
      const fkInfo = this.getFkInfoForColumn(dbName);
      if (fkInfo) {
        fieldType = 'reference';
        referenceEntity = fkInfo.referencedTable;
      } else if (column.type === 'enum' || column.enum) {
        fieldType = 'enum';
        enumValues = column.enum?.map(String);
      } else if (['int', 'integer', 'smallint', 'tinyint', 'bigint', 'decimal', 'float', 'double'].includes(String(column.type))) {
        fieldType = 'number';
      } else if (['date', 'datetime', 'timestamp'].includes(String(column.type))) {
        fieldType = 'date';
      } else if (column.type === 'boolean' || column.type === 'tinyint') {
        fieldType = 'boolean';
      }

      fields.push({
        name: dbName,
        label: bCol?.label || this.schemaMetadata.formatTechnicalName(dbName),
        type: fieldType,
        required: !column.isNullable && !column.default && !column.isGenerated,
        enumValues,
        referenceEntity,
        description: bCol?.description || '',
        example: bCol?.example || '',
      });
    }

    // Ajouter les alias "friendly" pour les FK (ex: "client" pour "client_id")
    for (const [alias, info] of this.fkMap) {
      if (!fields.find(f => f.name === alias)) {
        const fkField = fields.find(f => f.name === info.fkColumn);
        if (fkField) {
          fields.push({
            name: alias,
            label: `${fkField.label} (par nom)`,
            type: 'string',
            required: false,
            referenceEntity: info.referencedTable,
            description: `Nom ou code à résoudre automatiquement → ${info.fkColumn}`,
            example: '',
          });
        }
      }
    }

    return fields;
  }

  // ─── VALIDATION ─────────────────────────────────────────────────────────────

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (operation === 'INSERT') {
      // Vérifier les champs requis
      for (const column of this.entityMeta.columns) {
        const dbName = column.databaseName;
        if (SYSTEM_COLUMNS.has(dbName)) continue;
        if (column.isPrimary && column.isGenerated) continue;
        if (column.isNullable || column.default !== undefined) continue;

        // Le champ est requis — vérifier s'il est fourni (ou son alias FK)
        if (fields[dbName] === undefined && fields[dbName] === null) {
          // Vérifier si un alias FK est fourni à la place
          const alias = this.getAliasForFkColumn(dbName);
          if (!alias || fields[alias] === undefined) {
            const label = this.schemaMetadata.getBusinessLabel(this.entityName, dbName);
            errors.push(`Le champ "${label}" (${dbName}) est requis`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedFields: fields,
    };
  }

  // ─── RÉSOLUTION DES DÉPENDANCES ─────────────────────────────────────────────

  /**
   * Pour chaque champ FK, tente de résoudre une valeur texte en ID.
   * Ex: { client: "Nogoh Brice" } → { client_id: 42 }
   *
   * Surchargez cette méthode dans un handler custom pour une logique spécifique.
   */
  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
  ): Promise<Record<string, any>> {
    const resolved = { ...fields };

    for (const [alias, info] of this.fkMap) {
      const value = fields[alias];
      if (value === undefined) continue;

      if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
        // C'est déjà un ID numérique
        resolved[info.fkColumn] = Number(value);
        if (alias !== info.fkColumn) delete resolved[alias];
        continue;
      }

      if (typeof value === 'string' && value.startsWith('{{')) {
        // Référence tempId — sera résolue par GenericWriteService
        resolved[info.fkColumn] = value;
        if (alias !== info.fkColumn) delete resolved[alias];
        continue;
      }

      if (typeof value === 'string') {
        // Résolution par texte
        const result = await this.entityResolver.resolveAnyEntity(
          info.referencedTable,
          value,
        );

        if (result.found && result.best && !result.ambiguous) {
          resolved[info.fkColumn] = (result.best as any).id;
          if (alias !== info.fkColumn) delete resolved[alias];
          this.logger.log(
            `✅ ${alias} résolu: "${value}" → ID ${(result.best as any).id} (score: ${result.score}, via "${result.matchedOn}")`,
          );
        } else if (result.ambiguous) {
          const suggestions = result.candidates
            .slice(0, 3)
            .map((c: any) => `  - ${c.matchedOn} (score: ${c.score})`)
            .join('\n');
          throw new BadRequestException(
            `Ambiguïté pour "${alias}": "${value}". Plusieurs correspondances :\n${suggestions}\nVeuillez préciser.`,
          );
        } else {
          throw new BadRequestException(
            `${this.schemaMetadata.getBusinessLabel(this.entityName, info.fkColumn)} "${value}" introuvable. Vérifiez l'orthographe ou créez d'abord cette entité.`,
          );
        }
      }
    }

    // Aussi vérifier les champs FK directs (ex: client_id avec une valeur texte)
    for (const [alias, info] of this.fkMap) {
      const fkValue = resolved[info.fkColumn];
      if (typeof fkValue === 'string' && !fkValue.startsWith('{{') && !/^\d+$/.test(fkValue)) {
        // Le champ FK contient du texte → tenter résolution
        const result = await this.entityResolver.resolveAnyEntity(
          info.referencedTable,
          fkValue,
        );
        if (result.found && result.best && !result.ambiguous) {
          resolved[info.fkColumn] = (result.best as any).id;
          this.logger.log(
            `✅ ${info.fkColumn} résolu: "${fkValue}" → ID ${(result.best as any).id}`,
          );
        }
      }
    }

    return resolved;
  }

  // ─── EXÉCUTION ──────────────────────────────────────────────────────────────

  async execute(intent: WriteIntent, userId: string): Promise<WriteResult> {
    // 1. Résoudre les dépendances (noms → IDs)
    const resolvedFields = await this.resolveDependencies(intent.fields, userId);

    // 2. Valider
    const validation = await this.validateFields(resolvedFields, intent.operation as 'INSERT' | 'UPDATE');
    if (!validation.valid) {
      throw new BadRequestException(
        `Validation échouée pour ${this.entityName}: ${validation.errors?.join(', ')}`,
      );
    }

    const fields = validation.transformedFields || resolvedFields;

    // 3. Exécuter
    switch (intent.operation) {
      case 'INSERT':
        return this.doInsert(fields, userId);
      case 'UPDATE':
        if (!intent.entityId) {
          throw new BadRequestException(`ID requis pour UPDATE sur ${this.entityName}`);
        }
        return this.doUpdate(intent.entityId, fields, userId);
      case 'DELETE':
        throw new BadRequestException(
          `La suppression via IA n'est pas autorisée pour "${this.entityName}". Utilisez l'interface dédiée.`,
        );
      default:
        throw new BadRequestException(`Opération inconnue: ${intent.operation}`);
    }
  }

  // ─── INSERT / UPDATE (surchargeable) ────────────────────────────────────────

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    // Filtrer les champs inconnus
    const safeFields = this.filterKnownColumns(fields);

    const record = this.repo.create({ ...safeFields, created_by: userId });
    const saved = await this.repo.save(record);

    const label = this.schemaMetadata.getTableLabel(this.entityName);
    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `${label} créé(e) avec succès (ID: ${saved.id})`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const existing = await this.repo.findOne({ where: { id: entityId as any } });
    if (!existing) {
      const label = this.schemaMetadata.getTableLabel(this.entityName);
      throw new NotFoundException(`${label} ID ${entityId} introuvable`);
    }

    const safeFields = this.filterKnownColumns(fields);
    Object.assign(existing, safeFields, { updated_by: userId });
    const saved = await this.repo.save(existing);

    const label = this.schemaMetadata.getTableLabel(this.entityName);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `${label} ${entityId} mis(e) à jour avec succès`,
    };
  }

  // ─── UTILITAIRES INTERNES ───────────────────────────────────────────────────

  /**
   * Construit le mapping des FK :
   *   "client" → { fkColumn: "client_id", referencedTable: "customer" }
   *   "lawyer" → { fkColumn: "lawyer_id", referencedTable: "employee" }
   */
  private buildFkMap(): Map<string, { fkColumn: string; referencedTable: string }> {
    const map = new Map<string, { fkColumn: string; referencedTable: string }>();

    for (const relation of this.entityMeta.relations) {
      if (relation.relationType !== 'many-to-one') continue;

      const joinColumns = relation.joinColumns;
      if (!joinColumns || joinColumns.length === 0) continue;

      const fkColumn = joinColumns[0].databaseName;
      if (!fkColumn) continue;

      const referencedTable = relation.inverseEntityMetadata.tableName;

      // Alias = nom de la relation (ex: "client", "lawyer", "branch")
      const alias = relation.propertyName;
      map.set(alias, { fkColumn, referencedTable });

      // Aussi mapper le nom de la colonne FK sans _id
      const shortName = fkColumn.replace(/_id$/, '').replace(/Id$/, '');
      if (shortName !== alias && !map.has(shortName)) {
        map.set(shortName, { fkColumn, referencedTable });
      }
    }

    return map;
  }

  private getFkInfoForColumn(columnName: string): { fkColumn: string; referencedTable: string } | null {
    for (const [, info] of this.fkMap) {
      if (info.fkColumn === columnName) return info;
    }
    return null;
  }

  private getAliasForFkColumn(fkColumn: string): string | null {
    for (const [alias, info] of this.fkMap) {
      if (info.fkColumn === fkColumn) return alias;
    }
    return null;
  }

  /** Ne garde que les colonnes qui existent réellement dans la table */
  protected filterKnownColumns(fields: Record<string, any>): Record<string, any> {
    const knownColumns = new Set(
      this.entityMeta.columns.map(c => c.databaseName),
    );
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (knownColumns.has(key) && !SYSTEM_COLUMNS.has(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }
}
