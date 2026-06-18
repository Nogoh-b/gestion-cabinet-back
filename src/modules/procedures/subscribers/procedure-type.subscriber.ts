import { BaseEntitySubscriber } from 'src/core/subscribers/base-entity.subscriber';
import { DEFAULT_PROCEDURE_TEMPLATE_NAME } from 'src/modules/procedure/seeder/default-procedure-template.seeder';
import { ProcedureTemplateService } from 'src/modules/procedure/services/procedure-template.service';
import { DataSource, InsertEvent, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ProcedureType } from '../entities/procedure.entity';

/**
 * Subscriber métier pour l'entité ProcedureType.
 *
 * Effets automatiques (onBeforeCreate) :
 *
 *  1. GÉNÉRATION DU CODE
 *     Si entity.code est vide / non fourni, un code unique est généré
 *     automatiquement depuis le nom (ex: "Contentieux civil" → "CONT-CIVIL").
 *     L'unicité est garantie par ajout d'un suffixe numérique si nécessaire.
 *
 *  2. GÉNÉRATION DU TEMPLATE DE PROCÉDURE
 *     Si entity.procedure_template_id est vide, un template personnalisé
 *     nommé "Procédure - {name}" est créé par copie du template générique
 *     par défaut (stages, sub-stages, transitions).
 *
 * Les deux champs sont injectés dans l'entité AVANT l'INSERT pour éviter
 * un UPDATE secondaire.
 */
@Injectable()
export class ProcedureTypeSubscriber extends BaseEntitySubscriber<ProcedureType> {
  constructor(
    dataSource: DataSource,
    private readonly templateService: ProcedureTemplateService,
    @InjectRepository(ProcedureType)
    private readonly typeRepo: Repository<ProcedureType>,
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
    // ── 1. Génération du code ──────────────────────────────────────────────────
    if (!entity.code && entity.name) {
      entity.code = await this.generateUniqueCode(entity.name);
      this.logger.log(
        `ProcedureType "${entity.name}" → code généré automatiquement : "${entity.code}"`,
      );
    }

    // ── 2. Génération du template de procédure ─────────────────────────────────
    if (entity.procedure_template_id) return;

    const templateName = `Procédure - ${entity.name}`;

    // Vérifier si un template existe déjà avec ce nom (dédup)
    const existingTemplate = await this.templateService.findByName(templateName);
    if (existingTemplate) {
      entity.procedure_template_id = existingTemplate.id;
      this.logger.log(
        `ProcedureType "${entity.name}" → template existant réutilisé "${templateName}" (ID: ${existingTemplate.id})`,
      );
      return;
    }

    // Charger le template générique avec ses relations
    const defaultTemplate = await this.templateService.findByName(
      DEFAULT_PROCEDURE_TEMPLATE_NAME,
      ['stages', 'stages.subStages'],
    );

    if (!defaultTemplate) {
      this.logger.warn(
        `ProcedureType "${entity.name}" (${entity.code}) créé sans template — ` +
        `le template générique "${DEFAULT_PROCEDURE_TEMPLATE_NAME}" est introuvable en base. ` +
        `Exécutez DefaultProcedureTemplateSeeder.`,
      );
      return;
    }

    // Charger les transitions du template générique
    const fullDefaultTemplate = await this.templateService.findOne(defaultTemplate.id);

    // Créer un nouveau template par copie
    const newTemplate = await this.templateService.duplicateTemplate(
      fullDefaultTemplate,
      templateName,
      `Template généré automatiquement pour le type de procédure "${entity.name}"`,
    );

    entity.procedure_template_id = newTemplate.id;
    this.logger.log(
      `ProcedureType "${entity.name}" (${entity.code}) → nouveau template créé "${templateName}" (ID: ${newTemplate.id})`,
    );
  }

  // ── UTILITAIRES ──────────────────────────────────────────────────────────────

  /**
   * Génère un code unique depuis un nom lisible.
   * Ex: "Contentieux civil" → "CONT-CIVIL"
   *     "Droit de la famille" → "DROIT-FAMI"
   *
   * Garantit l'unicité en base en ajoutant un suffixe numérique si nécessaire.
   */
  private async generateUniqueCode(name: string): Promise<string> {
    const baseCode = this.generateCode(name);
    return this.ensureUniqueCode(baseCode);
  }

  /**
   * Génère un code court depuis un nom lisible (logique identique à
   * ProcedureTypeWriteHandler.generateCode).
   */
  private generateCode(name: string): string {
    const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'ou', 'en', 'au', 'aux', 'un', 'une']);
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // supprimer les accents
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')       // garder lettres + chiffres + espaces
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
      .slice(0, 3)                       // max 3 mots
      .map((w) => w.slice(0, 5))         // max 5 caractères par mot
      .join('-')
      .slice(0, 50);                     // longueur max colonne
  }

  /**
   * Garantit l'unicité du code en ajoutant un suffixe numérique si nécessaire.
   * Ex: "CONT-CIVIL" → "CONT-CIVIL-2" → "CONT-CIVIL-3" ...
   */
  private async ensureUniqueCode(baseCode: string): Promise<string> {
    let code = baseCode;
    let attempt = 1;
    while (attempt <= 100) {
      const existing = await this.typeRepo.findOne({ where: { code } });
      if (!existing) return code;
      attempt++;
      code = `${baseCode}-${attempt}`;
    }
    return `${baseCode.slice(0, 40)}-${Date.now() % 10000}`;
  }
}
