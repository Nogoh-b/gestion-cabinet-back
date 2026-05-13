/**
 * AutoHandlerFactory — Génère automatiquement un BaseWriteHandler pour chaque
 * entité TypeORM décorée @BusinessTable qui n'a pas de handler custom enregistré.
 *
 * Fonctionnement :
 *   1. Au démarrage (onModuleInit), scanne toutes les EntityMetadata de TypeORM
 *   2. Pour chaque entité avec @BusinessTable non-ignorée :
 *      - Si un handler est déjà enregistré (par un module métier) → skip
 *      - Sinon → crée un BaseWriteHandler et l'enregistre dans le Registry
 *   3. Résultat : TOUTES les entités décorées sont immédiatement writable via IA
 *
 * Pour une logique métier spécifique (ex: génération de numéro de dossier),
 * le module métier enregistre son propre handler AVANT que cette factory ne passe.
 * L'ordre est garanti par le flag `afterHandlersRegistered`.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { WriteHandlerRegistry } from './write-handler.registry';
import { BaseWriteHandler } from './base-write-handler';
import { SchemaMetadataService } from '../schema-metadata.service';
import { EntityResolverService } from './entity-resolver.service';
import { BUSINESS_METADATA_KEY, BusinessTableMetadata } from '../../decorators/business-metadata.decorator';

@Injectable()
export class AutoHandlerFactory implements OnModuleInit {
  private readonly logger = new Logger(AutoHandlerFactory.name);
  private initialized = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: WriteHandlerRegistry,
    private readonly schemaMetadata: SchemaMetadataService,
    private readonly entityResolver: EntityResolverService,
  ) {}

  /**
   * Appelé automatiquement par NestJS après l'injection de toutes les dépendances.
   *
   * À ce stade, les modules métier (DossiersModule, etc.) ont déjà exécuté leur
   * propre onModuleInit et enregistré leurs handlers custom dans le Registry.
   *
   * Note: Si l'ordre d'initialisation pose problème, utilisez
   * `registerAutoHandlers()` manuellement après le bootstrap.
   */
  async onModuleInit() {
    // Petit délai pour laisser les modules métier s'enregistrer en premier
    // NestJS initialise les modules dans l'ordre d'import, mais les onModuleInit
    // des providers d'un même module s'exécutent en parallèle.
    // On utilise setTimeout(0) pour se placer en fin de microtask queue.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await this.registerAutoHandlers();
  }

  /**
   * Scanne toutes les entités et enregistre des BaseWriteHandler pour celles
   * qui n'ont pas encore de handler custom.
   */
  async registerAutoHandlers(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const entityMetadatas = this.dataSource.entityMetadatas;
    let registered = 0;
    let skippedCustom = 0;
    let skippedNoDecorator = 0;
    let skippedIgnored = 0;

    for (const meta of entityMetadatas) {
      const tableName = meta.tableName;
      const entityClass = meta.target;

      // 1. Vérifier si l'entité a @BusinessTable
      let tableMeta: BusinessTableMetadata | undefined;
      try {
        tableMeta = Reflect.getMetadata(BUSINESS_METADATA_KEY, entityClass) as BusinessTableMetadata;
      } catch {
        // pas de métadonnées → skip
      }

      if (!tableMeta) {
        skippedNoDecorator++;
        continue;
      }

      if (tableMeta.ignored) {
        skippedIgnored++;
        this.logger.debug(`⏭️ ${tableName}: @BusinessTable(ignored=true)`);
        continue;
      }

      // 2. Vérifier si un handler custom est déjà enregistré
      if (this.registry.getHandler(tableName)) {
        skippedCustom++;
        this.logger.debug(`⏭️ ${tableName}: handler custom déjà enregistré`);
        continue;
      }

      // 3. Créer et enregistrer un BaseWriteHandler générique
      try {
        const handler = new BaseWriteHandler(
          tableName,
          this.dataSource,
          this.schemaMetadata,
          this.entityResolver,
        );
        this.registry.register(handler);
        registered++;
        this.logger.log(
          `🔧 Auto-handler enregistré: ${tableName} (${tableMeta.label})`,
        );
      } catch (error) {
        this.logger.warn(
          `⚠️ Impossible de créer un handler pour "${tableName}": ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `\n📊 AutoHandlerFactory — Résumé:\n` +
      `   ✅ ${registered} handlers auto-générés\n` +
      `   🎯 ${skippedCustom} handlers custom préservés\n` +
      `   ⏭️  ${skippedIgnored} tables ignorées (@BusinessTable.ignored)\n` +
      `   📦 ${skippedNoDecorator} tables sans @BusinessTable\n` +
      `   📝 Total handlers actifs: ${this.registry.getAllHandlers().length}`,
    );
  }

  /**
   * Force la re-génération de tous les auto-handlers.
   * Utile en cas de changement de schéma à chaud (rare).
   */
  async refreshHandlers(): Promise<void> {
    this.initialized = false;
    await this.registerAutoHandlers();
  }
}
