// src/modules/dossiers/dossier-write.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Dossier, DangerLevel } from './entities/dossier.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

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

  // ── INSERT custom : génération du numéro de dossier ────────────────────────

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    // Générer le numéro de dossier DOS-YYYY-XXXX
    const year = new Date().getFullYear();
    const countThisYear = await this.dossierRepo
      .createQueryBuilder('d')
      .where('YEAR(d.opening_date) = :year', { year })
      .getCount();
    const dossierNumber = `DOS-${year}-${(countThisYear + 1).toString().padStart(4, '0')}`;

    // Filtrer les champs connus + appliquer les valeurs par défaut
    const safeFields = this.filterKnownColumns(fields);

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
