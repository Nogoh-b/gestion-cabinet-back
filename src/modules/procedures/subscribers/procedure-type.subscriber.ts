import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository } from 'typeorm';
import { BaseEntitySubscriber } from 'src/core/subscribers/base-entity.subscriber';
import { ProcedureType } from '../entities/procedure.entity';
import { ProcedureTemplate } from 'src/modules/procedure/entities/procedure-template.entity';
import { DEFAULT_PROCEDURE_TEMPLATE_NAME } from 'src/modules/procedure/seeder/default-procedure-template.seeder';

/**
 * Subscriber métier pour l'entité ProcedureType.
 *
 * Effet automatique :
 *  - Création d'un type / sous-type de procédure sans template →
 *    assignation automatique du template générique par défaut.
 *
 * Le champ est injecté dans l'entité AVANT l'INSERT (onBeforeCreate) pour
 * éviter un UPDATE secondaire.
 * Si le template générique n'existe pas encore en base (ex. pendant le seed
 * initial), l'entité est simplement créée sans template et un avertissement
 * est loggé.
 */
@Injectable()
export class ProcedureTypeSubscriber extends BaseEntitySubscriber<ProcedureType> {
  constructor(
    dataSource: DataSource,
    @InjectRepository(ProcedureTemplate)
    private readonly templateRepo: Repository<ProcedureTemplate>,
  ) {
    super(dataSource);
  }

  listenTo() {
    return ProcedureType;
  }

  // ── AVANT L'INSERT ──────────────────────────────────────────────────────────

  protected async onBeforeCreate(
    entity: ProcedureType,
    _event: InsertEvent<ProcedureType>,
  ): Promise<void> {
    // Déjà lié : rien à faire
    if (entity.procedure_template_id) return;

    const defaultTemplate = await this.templateRepo.findOne({
      where: { name: DEFAULT_PROCEDURE_TEMPLATE_NAME },
      select: ['id'],
    });

    if (!defaultTemplate) {
      // Peut arriver si le seeder DefaultProcedureTemplateSeeder n'a pas encore
      // été exécuté (ex. toute première migration à blanc).
      this.logger.warn(
        `ProcedureType "${entity.name}" (${entity.code}) créé sans template — ` +
        `le template générique "${DEFAULT_PROCEDURE_TEMPLATE_NAME}" est introuvable en base. ` +
        `Exécutez DefaultProcedureTemplateSeeder.`,
      );
      return;
    }

    entity.procedure_template_id = defaultTemplate.id;

    this.logger.log(
      `ProcedureType "${entity.name}" (${entity.code}) → template générique assigné (ID: ${defaultTemplate.id})`,
    );
  }
}
