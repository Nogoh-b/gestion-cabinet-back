// src/modules/dossiers/dossier-write.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Dossier, DangerLevel } from './entities/dossier.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService, ResolveConfig } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';
import { AmbiguityException } from 'src/core/ai-database/write/ambiguity.exception';

/**
 * Handler custom pour les dossiers.
 * Étend BaseWriteHandler pour hériter de la résolution FK générique,
 * et surcharge uniquement la logique métier spécifique :
 *   - Génération du numéro de dossier (DOS-YYYY-XXXX)
 *   - Valeurs par défaut (status, priority_level, danger_level)
 *   - Validation métier (client + avocat requis)
 */
@Injectable()
export class DossierWriteHandler extends BaseWriteHandler {

  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
  ) {
    super('dossiers', dataSource, schemaMetadata, entityResolver);
  }

  // ── Schema override : ajouter des descriptions/exemples plus précis ────────

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    // Récupérer le schéma auto-généré par BaseWriteHandler
    const fields = await super.getWriteableFieldsSchema();

    // Enrichir les champs clés avec des descriptions métier précises
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      client_id: {
        description: 'ID du client associé au dossier. Peut aussi fournir "client" avec le nom.',
        example: '1',
      },
      object: {
        description: "Description synthétique de l'affaire",
        example: 'Litige commercial pour non-paiement de factures',
      },
      status: {
        description: '0=Ouvert, 1=Analyse, 2=Amicable, 3=Contentieux',
        example: '0',
      },
      lawyer_id: {
        description: "ID de l'avocat responsable. Peut aussi fournir \"lawyer\" avec le nom.",
        example: '1',
      },
      priority_level: {
        description: '0=Normale, 1=Haute, 2=Prioritaire, 3=Urgent absolu',
        example: '1',
      },
      danger_level: {
        description: '0=Faible, 1=Normal, 2=Élevé, 3=Critique',
        example: '2',
      },
      procedure_type_id: {
        description: 'ID du type de procédure. Peut aussi fournir "procedure_type" avec le nom (ex: "Contentieux civil", "Droit des affaires").',
        example: '1',
        required: true,
      },
      procedure_subtype_id: {
        description: 'ID du sous-type de procédure. Peut aussi fournir "procedure_subtype" avec le nom (ex: "Rupture conventionnelle", "Divorce").',
        example: '1',
        required: true,
      },
    };

    for (const field of fields) {
      const enrichment = enrichments[field.name];
      if (enrichment) {
        Object.assign(field, enrichment);
      }
    }

    return fields;
  }

  // ── Validation métier ──────────────────────────────────────────────────────

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    this.logger.log('Validating dossier fields', { operation, fields });

    if (operation === 'INSERT') {
      // Client requis
      if (!fields.client_id) {
        errors.push('Le client est requis pour créer un dossier (client_id ou client)');
      }

      // Objet du litige requis
      if (!fields.object) {
        errors.push("L'objet du litige est requis");
      }

      // Avocat référent requis
      if (!fields.lawyer_id) {
        errors.push("L'avocat référent est requis (lawyer_id ou lawyer)");
      }

      // Type de procédure requis
      if (!fields.procedure_type_id) {
        errors.push('Le type de procédure est requis (procedure_type_id ou procedure_type)');
      }

      // Sous-type de procédure requis
      if (!fields.procedure_subtype_id) {
        errors.push('Le sous-type de procédure est requis (procedure_subtype_id ou procedure_subtype)');
      }
    } else if (operation === 'UPDATE') {
      // Vérifications spécifiques UPDATE : on peut modifier procedure_type mais pas le rendre vide
      if (fields.procedure_type_id === null || fields.procedure_subtype_id === null) {
        errors.push('Le type et sous-type de procédure ne peuvent pas être supprimés');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedFields: fields,
    };
  }

  // ── Résolution des dépendances : procedure_subtype filtré par procedure_type ──

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: ResolveConfig,
  ): Promise<Record<string, any>> {
    // 1. Résoudre d'abord tous les champs sauf procedure_subtype
    const withoutSubtype = { ...fields };
    const subtypeValue = withoutSubtype.procedure_subtype;
    delete withoutSubtype.procedure_subtype;

    const resolved = await super.resolveDependencies(withoutSubtype, userId, createdEntities, config);

    // 2. Résoudre procedure_subtype avec parent_id = procedure_type_id résolu
    if (subtypeValue !== undefined) {
      const parentId = resolved.procedure_subtype_id ?? resolved.procedure_type_id;

      if (typeof subtypeValue === 'number' || (typeof subtypeValue === 'string' && /^\d+$/.test(subtypeValue))) {
        resolved.procedure_subtype_id = Number(subtypeValue);
      } else if (typeof subtypeValue === 'string') {
        // 1ère tentative : filtre strict par parent_id
        const strictFilter = parentId ? { parent_id: parentId } : undefined;
        let result = await this.entityResolver.resolveOrCreateEntity(
          'procedure_types',
          subtypeValue,
          userId,
          undefined,
          config,
          strictFilter,
        );

        // 2ème tentative : sans filtre si rien trouvé avec parent_id (data inconsistante possible)
        if (!result.resolved.found && !result.resolved.ambiguous && strictFilter) {
          this.logger.log(`🔄 Sous-type non trouvé avec parent_id=${parentId}, nouvelle tentative sans filtre`);
          result = await this.entityResolver.resolveOrCreateEntity(
            'procedure_types',
            subtypeValue,
            userId,
            undefined,
            config,
          );
        }

        if (result.resolved.found && result.resolved.best && !result.resolved.ambiguous) {
          resolved.procedure_subtype_id = (result.resolved.best as any).id;
          this.logger.log(`✅ procedure_subtype résolu: "${subtypeValue}" → ID ${resolved.procedure_subtype_id}`);
        } else if (result.resolved.ambiguous || (result.resolved.candidates && result.resolved.candidates.length > 0)) {
          // Ambiguïté OU suggestions à proposer (top 10) → laisser l'utilisateur choisir
          const candidates = result.resolved.candidates.slice(0, 10).map((c: any) => ({
            id: (c.entity as any).id,
            label: c.matchedOn,
            score: c.score,
            data: c.entity,
          }));
          this.logger.warn(
            `🔍 ${candidates.length} suggestion(s) pour le sous-type "${subtypeValue}" — choix utilisateur requis`,
          );
          throw new AmbiguityException('procedure_types', 'procedure_subtype', subtypeValue, candidates, -1, this.entityName);
        } else {
          throw new Error(`Impossible de trouver le sous-type "${subtypeValue}": ${result.message}`);
        }
      }
    }

    // ── Proposer des suggestions pour les FK requises mais absentes ──────────
    // Si le LLM n'a pas fourni lawyer / client / procedure_type, on propose
    // les options les plus pertinentes au lieu d'échouer en validation.

    if (!resolved.lawyer_id) {
      const candidates = await this.fetchTopEmployees();
      if (candidates.length > 0) {
        this.logger.warn(`🔍 lawyer manquant — proposition de ${candidates.length} avocats`);
        throw new AmbiguityException('employee', 'lawyer', '(non spécifié)', candidates, -1, this.entityName);
      }
    }

    if (!resolved.procedure_type_id) {
      const candidates = await this.fetchTopProcedureTypes(false);
      if (candidates.length > 0) {
        this.logger.warn(`🔍 procedure_type manquant — proposition de ${candidates.length} types`);
        throw new AmbiguityException('procedure_types', 'procedure_type', '(non spécifié)', candidates, -1, this.entityName);
      }
    }

    if (!resolved.procedure_subtype_id) {
      const parentId = resolved.procedure_type_id;
      const candidates = await this.fetchTopProcedureTypes(true, parentId);
      if (candidates.length > 0) {
        this.logger.warn(`🔍 procedure_subtype manquant — proposition de ${candidates.length} sous-types`);
        throw new AmbiguityException('procedure_types', 'procedure_subtype', '(non spécifié)', candidates, -1, this.entityName);
      }
    }

    return resolved;
  }

  /** Récupère les 10 employés les plus récents avec leur user (pour avocat) */
  private async fetchTopEmployees(): Promise<Array<{ id: any; label: string; score: number; data: any }>> {
    try {
      const employees = await this.dataSource
        .getRepository('employee')
        .createQueryBuilder('e')
        .leftJoinAndSelect('e.user', 'u')
        .orderBy('e.id', 'DESC')
        .limit(10)
        .getMany();
      return employees.map((e: any) => ({
        id: e.id,
        label: `${e.user?.first_name ?? ''} ${e.user?.last_name ?? ''}`.trim() +
          (e.specialization ? ` — ${e.specialization}` : ''),
        score: 0,
        data: e,
      }));
    } catch (err) {
      this.logger.error(`Erreur récupération employés: ${(err as Error).message}`);
      return [];
    }
  }

  /** Récupère les 10 procedure_types (types ou sous-types selon le filtre) */
  private async fetchTopProcedureTypes(
    isSubtype: boolean,
    parentId?: number,
  ): Promise<Array<{ id: any; label: string; score: number; data: any }>> {
    try {
      const qb = this.dataSource
        .getRepository('procedure_types')
        .createQueryBuilder('pt')
        .where('pt.is_active = :active', { active: true });

      if (isSubtype) {
        if (parentId) {
          qb.andWhere('pt.parent_id = :pid', { pid: parentId });
        } else {
          qb.andWhere('pt.is_subtype = :sub', { sub: true });
        }
      } else {
        qb.andWhere('pt.is_subtype = :sub', { sub: false });
      }

      const rows = await qb.orderBy('pt.name', 'ASC').limit(10).getMany();
      return rows.map((p: any) => ({
        id: p.id,
        label: `${p.name}${p.code ? ` (${p.code})` : ''}`,
        score: 0,
        data: p,
      }));
    } catch (err) {
      this.logger.error(`Erreur récupération procedure_types: ${(err as Error).message}`);
      return [];
    }
  }

  // ── INSERT custom : génération du numéro de dossier ────────────────────────

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    // Générer le numéro de dossier DOS-YYYY-XXXX
    // Utilise le MAX existant (y compris soft-deleted) pour éviter les collisions
    // CRITICAL: .withDeleted() est obligatoire car la contrainte UNIQUE de la BDD
    // s'applique même aux lignes soft-deleted (deleted_at != null).
    const year = new Date().getFullYear();
    const prefix = `DOS-${year}-`;
    const lastDossier = await this.dossierRepo
      .createQueryBuilder('d')
      .withDeleted() // ← inclure les dossiers soft-deleted
      .where('d.dossier_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('d.dossier_number', 'DESC')
      .getOne();
    let nextSeq = 1;
    if (lastDossier?.dossier_number) {
      const match = lastDossier.dossier_number.match(/DOS-\d{4}-(\d+)$/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }
    let dossierNumber = `${prefix}${nextSeq.toString().padStart(4, '0')}`;

    // Filet de sécurité : si malgré tout le numéro est déjà pris (race condition,
    // ordre lexicographique ambigu, etc.), boucler jusqu'à trouver un numéro libre.
    let safety = 0;
    while (safety++ < 100) {
      const existing = await this.dossierRepo
        .createQueryBuilder('d')
        .withDeleted()
        .where('d.dossier_number = :n', { n: dossierNumber })
        .getOne();
      if (!existing) break;
      nextSeq++;
      dossierNumber = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    }

    // Filtrer les champs connus + stripper les champs auto-générés (codes, refs)
    // → on ne veut pas que le LLM impose un dossier_number qui causerait collision
    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));

    const dossierData = {
      ...safeFields,
      dossier_number: dossierNumber,
      opening_date: new Date(),
      status: safeFields.status !== undefined ? parseInt(safeFields.status) : DossierStatus.OPEN,
      priority_level: safeFields.priority_level || 0,
      danger_level: safeFields.danger_level || DangerLevel.Normal,
      // S'assurer que procedure_type_id et procedure_subtype_id sont des nombres
      procedure_type_id: safeFields.procedure_type_id ? Number(safeFields.procedure_type_id) : undefined,
      procedure_subtype_id: safeFields.procedure_subtype_id ? Number(safeFields.procedure_subtype_id) : undefined,
    } as any;

    // Supprimer les undefined pour laisser TypeORM gérer les defaults
    Object.keys(dossierData).forEach(key => {
      if (dossierData[key] === undefined) delete dossierData[key];
    });

    const dossier = Object.assign(new Dossier(), dossierData);
    const saved = await this.dossierRepo.save(dossier);

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Dossier ${saved.dossier_number} créé avec succès`,
    };
  }

  // ── UPDATE custom : préserver le numéro de dossier ─────────────────────────

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const dossier = await this.dossierRepo.findOne({
      where: { id: entityId as number },
    });
    if (!dossier) {
      throw new NotFoundException(`Dossier ID ${entityId} introuvable`);
    }

    const safeFields = this.filterKnownColumns(fields);
    // Ne jamais écraser le numéro de dossier ni la date d'ouverture
    delete safeFields['dossier_number'];
    delete safeFields['opening_date'];

    Object.assign(dossier, safeFields, { updated_by: userId });
    const saved = await this.dossierRepo.save(dossier);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Dossier ${saved.dossier_number} mis à jour avec succès`,
    };
  }
}
