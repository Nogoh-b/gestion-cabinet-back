import {
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  ObjectLiteral,
  DataSource,
} from 'typeorm';
import { Logger } from '@nestjs/common';

export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

/**
 * Classe de base pour tous les subscribers d'entités TypeORM dans l'application.
 *
 * Avantages par rapport à implémenter EntitySubscriberInterface directement :
 *   - Enregistrement automatique auprès du DataSource
 *   - Gestion des erreurs centralisée (une erreur dans un hook ne bloque pas la requête)
 *   - Utilitaires : getChangedColumns, hasRelationChanged, getFieldChanges
 *   - Logger nommé automatiquement d'après la classe fille
 *
 * Usage :
 *   @Injectable()
 *   export class MySubscriber extends BaseEntitySubscriber<MyEntity> {
 *     constructor(dataSource: DataSource, ...) { super(dataSource); }
 *     listenTo() { return MyEntity; }
 *
 *     protected async onAfterCreate(entity: MyEntity, event: InsertEvent<MyEntity>) {
 *       // logique post-création
 *     }
 *
 *     protected async onAfterUpdate(entity: Partial<MyEntity>, event: UpdateEvent<MyEntity>) {
 *       if (this.hasRelationChanged(event, 'collaborators')) { ... }
 *       if (this.hasColumnChanged(event, 'status')) { ... }
 *     }
 *   }
 */
export abstract class BaseEntitySubscriber<T extends ObjectLiteral>
  implements EntitySubscriberInterface<T>
{
  protected readonly logger: Logger;

  constructor(protected readonly dataSource: DataSource) {
    this.logger = new Logger(this.constructor.name);
    this.dataSource.subscribers.push(this);
  }

  abstract listenTo(): Function;

  // ── Hooks à surcharger dans la classe fille ─────────────────────────────

  /** Appelé AVANT l'insertion en base. Peut modifier l'entité. */
  protected async onBeforeCreate(entity: T, event: InsertEvent<T>): Promise<void> {}

  /** Appelé APRÈS l'insertion réussie. L'entité a son id définitif. */
  protected async onAfterCreate(entity: T, event: InsertEvent<T>): Promise<void> {}

  /** Appelé AVANT la mise à jour. Peut modifier les champs. */
  protected async onBeforeUpdate(entity: Partial<T>, event: UpdateEvent<T>): Promise<void> {}

  /** Appelé APRÈS la mise à jour réussie. */
  protected async onAfterUpdate(entity: Partial<T>, event: UpdateEvent<T>): Promise<void> {}

  /** Appelé APRÈS la suppression (hard delete). */
  protected async onAfterRemove(entity: T, event: RemoveEvent<T>): Promise<void> {}

  // ── Implémentation TypeORM (ne pas surcharger) ───────────────────────────

  async beforeInsert(event: InsertEvent<T>): Promise<void> {
    try {
      await this.onBeforeCreate(event.entity, event);
    } catch (err) {
      this.logger.error(`beforeInsert: ${err.message}`, err.stack);
    }
  }

  async afterInsert(event: InsertEvent<T>): Promise<void> {
    try {
      await this.onAfterCreate(event.entity, event);
    } catch (err) {
      this.logger.error(`afterInsert: ${err.message}`, err.stack);
    }
  }

  async beforeUpdate(event: UpdateEvent<T>): Promise<void> {
    try {
      if (event.entity) await this.onBeforeUpdate(event.entity as Partial<T>, event);
    } catch (err) {
      this.logger.error(`beforeUpdate: ${err.message}`, err.stack);
    }
  }

  async afterUpdate(event: UpdateEvent<T>): Promise<void> {
    try {
      if (event.entity) await this.onAfterUpdate(event.entity as Partial<T>, event);
    } catch (err) {
      this.logger.error(`afterUpdate: ${err.message}`, err.stack);
    }
  }

  async afterRemove(event: RemoveEvent<T>): Promise<void> {
    try {
      if (event.entity) await this.onAfterRemove(event.entity, event);
    } catch (err) {
      this.logger.error(`afterRemove: ${err.message}`, err.stack);
    }
  }

  // ── Utilitaires ─────────────────────────────────────────────────────────

  /**
   * Retourne les noms de propriétés des colonnes qui ont changé lors d'un UPDATE.
   * Ne couvre pas les relations ManyToMany (utiliser hasRelationChanged pour ça).
   */
  protected getChangedColumns(event: UpdateEvent<T>): string[] {
    return (event.updatedColumns ?? []).map(col => col.propertyName);
  }

  /**
   * Vérifie si une colonne scalaire spécifique a changé.
   * Exemple : this.hasColumnChanged(event, 'status')
   */
  protected hasColumnChanged(event: UpdateEvent<T>, propertyName: string): boolean {
    return this.getChangedColumns(event).includes(propertyName);
  }

  /**
   * Vérifie si une relation (ManyToMany, OneToMany) a été modifiée lors du save().
   * TypeORM renseigne event.updatedRelations quand des relations sont persistées.
   * Exemple : this.hasRelationChanged(event, 'collaborators')
   */
  protected hasRelationChanged(event: UpdateEvent<T>, relationName: string): boolean {
    return (event.updatedRelations ?? []).some(
      rel => rel.propertyName === relationName,
    );
  }

  /**
   * Retourne les changements de valeur (avant/après) pour une liste de champs scalaires.
   * Utiliser dans onAfterUpdate pour journaliser ou déclencher des effets de bord.
   *
   * Exemple :
   *   const changes = this.getFieldChanges(event, ['status', 'priority_level']);
   *   const statusChange = changes.find(c => c.field === 'status');
   *   if (statusChange) sendStatusEmail(statusChange.oldValue, statusChange.newValue);
   */
  protected getFieldChanges(event: UpdateEvent<T>, fields: string[]): FieldChange[] {
    const changes: FieldChange[] = [];
    for (const field of fields) {
      if (this.hasColumnChanged(event, field)) {
        changes.push({
          field,
          oldValue: (event.databaseEntity as any)?.[field],
          newValue: (event.entity as any)?.[field],
        });
      }
    }
    return changes;
  }
}
