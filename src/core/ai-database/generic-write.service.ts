// generic-write.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { WriteOperation, WritePlan } from "./dto/analysis-response.dto";
import { WriteHandlerRegistry, WriteResult } from "./write/write-handler.registry";

import { InjectDataSource } from "@nestjs/typeorm";
import { WriteIntent } from "./interface/write-intent.interface";

@Injectable()
export class GenericWriteService {
  private readonly logger = new Logger(GenericWriteService.name);

  /** Champs qu'aucun handler ni le générique ne peut modifier */
  private readonly PROTECTED_FIELDS = new Set([
    'id', 'created_at', 'deleted_at', 'deleted_by',
    'password', 'token', 'secret', 'refreshToken',
  ]);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: WriteHandlerRegistry,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // POINT D'ENTRÉE PRINCIPAL : exécution d'un plan multi-opérations
  // ─────────────────────────────────────────────────────────────────────────────

  async executePlan(writePlan: WritePlan, userId: string): Promise<WriteResult[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    if (writePlan.transaction) {
      await queryRunner.startTransaction();
      this.logger.log('🔄 Transaction démarrée pour le plan d\'écriture');
    }

    const results: WriteResult[] = [];
    // tempId → entité créée (pour résoudre les références entre opérations)
    const createdEntities = new Map<string, any>();

    try {
      for (let i = 0; i < writePlan.operations.length; i++) {
        const operation = writePlan.operations[i];

        this.logger.log(
          `📝 Opération ${i + 1}/${writePlan.operations.length}: ${operation.operation} ${operation.entity}`,
        );

        // Résoudre les références aux entités créées dans les opérations précédentes
        const resolvedFields = this.resolveReferences(operation.fields, createdEntities);

        // ✅ Exécution : handler enregistré en priorité, générique en fallback
        const result = await this.executeOperation(
          operation,
          resolvedFields,
          userId,
          queryRunner,
        );

        results.push(result);

        // Mémoriser l'entité créée pour les opérations suivantes
        if (operation.tempId && result.entityId && result.data) {
          createdEntities.set(operation.tempId, result.data);
          this.logger.log(`🔗 Référence stockée: ${operation.tempId} → ID ${result.entityId}`);
        }
      }

      if (writePlan.transaction) {
        await queryRunner.commitTransaction();
        this.logger.log('✅ Transaction validée');
      }

      return results;
    } catch (error) {
      if (writePlan.transaction) {
        await queryRunner.rollbackTransaction();
        this.logger.error(`❌ Transaction annulée: ${error.message}`);
      }
      throw new BadRequestException(`Échec du plan d'écriture: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // executeOperation — CŒUR DE LA PRIORITÉ HANDLER vs GÉNÉRIQUE
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeOperation(
    operation: WriteOperation,
    resolvedFields: Record<string, any>,
    userId: string,
    queryRunner: QueryRunner,
  ): Promise<WriteResult> {

    // ✅ 1. Chercher un handler enregistré pour cette entité
    const handler = this.registry.getHandler(operation.entity);

    if (handler) {
      this.logger.log(
        `🎯 Handler trouvé pour "${operation.entity}" → délégation au handler métier`,
      );

      // Construire un WriteIntent à partir de l'opération courante
      const intent: WriteIntent = {
        operation: operation.operation,
        entity:    operation.entity,
        entityId:  operation.entityId,
        fields:    resolvedFields,
        confidence: 1,
        humanReadable: operation.humanReadable ?? '',
      };

      // Le handler gère validation + résolution des dépendances + persistance
      // Il délègue lui-même au service métier (ex: DossiersService.create)
      return handler.execute(intent, userId);
    }

    // ✅ 2. Pas de handler → chemin générique (TypeORM direct)
    this.logger.log(
      `⚙️ Aucun handler pour "${operation.entity}" → écriture générique TypeORM`,
    );

    return this.executeGeneric(operation, resolvedFields, userId, queryRunner);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHEMIN GÉNÉRIQUE (utilisé uniquement si aucun handler n'est enregistré)
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeGeneric(
    operation: WriteOperation,
    fields: Record<string, any>,
    userId: string,
    queryRunner: QueryRunner,
  ): Promise<WriteResult> {

    const safeFields = this.sanitizeFields(fields);

    if (Object.keys(safeFields).length === 0) {
      throw new BadRequestException('Aucun champ valide à écrire après filtrage de sécurité');
    }

    switch (operation.operation) {
      case 'INSERT':
        return this.genericInsert(operation.entity, safeFields, userId, queryRunner);

      case 'UPDATE':
        if (!operation.entityId) {
          throw new BadRequestException(`UPDATE sur "${operation.entity}" : entityId manquant`);
        }
        return this.genericUpdate(operation.entity, operation.entityId, safeFields, userId, queryRunner);

      case 'DELETE':
        throw new BadRequestException(
          'La suppression via IA n\'est pas autorisée. Utilisez l\'interface dédiée.',
        );

      default:
        throw new BadRequestException(`Opération inconnue: ${operation.operation}`);
    }
  }

  private async genericInsert(
    entity: string,
    fields: Record<string, any>,
    userId: string,
    queryRunner: QueryRunner,
  ): Promise<WriteResult> {
    const repo = queryRunner.manager.getRepository(entity);
    const record = repo.create({ ...fields, created_by: userId });
    const saved = await repo.save(record);

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Enregistrement créé (ID: ${saved.id}) dans "${entity}"`,
    };
  }

  private async genericUpdate(
    entity: string,
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
    queryRunner: QueryRunner,
  ): Promise<WriteResult> {
    const repo = queryRunner.manager.getRepository(entity);
    const existing = await repo.findOne({ where: { id: entityId as any } });

    if (!existing) {
      throw new NotFoundException(`Enregistrement ID ${entityId} introuvable dans "${entity}"`);
    }

    Object.assign(existing, fields, { updated_by: userId });
    const saved = await repo.save(existing);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Enregistrement ${entityId} mis à jour dans "${entity}"`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITAIRES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Remplace les références temporaires par les vraies valeurs
   * des entités créées dans les opérations précédentes.
   *
   * Supporte deux formats (pour compatibilité) :
   * - {{tempId.field}}  (format LLM, standard)
   * - $tempId.field      (format legacy)
   *
   * Exemple : fields.client_id = "{{new_customer.id}}"
   *           → remplacé par l'ID réel du customer créé à l'étape précédente
   */
  private resolveReferences(
    fields: Record<string, any>,
    createdEntities: Map<string, any>,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};
    const mustacheRegex = /\{\{(\w+)\.(\w+)\}\}/g;

    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string') {
        resolved[key] = value;
        continue;
      }

      // ✅ Format principal : {{tempId.field}}
      if (value.includes('{{')) {
        resolved[key] = value.replace(mustacheRegex, (match, tempId, field) => {
          const entity = createdEntities.get(tempId);
          if (entity) {
            this.logger.debug(`🔗 Référence résolue: ${match} → ${entity[field]}`);
            return entity[field] ?? match;
          }
          this.logger.warn(`⚠️ Référence non résolue: ${match} (tempId "${tempId}" inconnu)`);
          return match;
        });
        continue;
      }

      // ✅ Format legacy : $tempId.field
      if (value.startsWith('$')) {
        const [tempId, fieldName] = value.slice(1).split('.');
        if (createdEntities.has(tempId)) {
          const entity = createdEntities.get(tempId);
          resolved[key] = fieldName ? entity[fieldName] : entity;
          this.logger.debug(`🔗 Référence résolue (legacy): ${value} → ${resolved[key]}`);
        } else {
          this.logger.warn(`⚠️ Référence non résolue: ${value} (tempId "${tempId}" inconnu)`);
          resolved[key] = value;
        }
        continue;
      }

      resolved[key] = value;
    }

    return resolved;
  }

  /** Filtre les champs protégés pour le chemin générique */
  private sanitizeFields(fields: Record<string, any>): Record<string, any> {
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (this.PROTECTED_FIELDS.has(key)) {
        this.logger.warn(`🔒 Champ protégé ignoré: ${key}`);
        continue;
      }
      safe[key] = value;
    }
    return safe;
  }
}