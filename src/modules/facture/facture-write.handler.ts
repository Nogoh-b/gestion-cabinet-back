// src/modules/facture/facture-write.handler.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Facture } from './entities/facture.entity';
import { StatutFacture, TypeFacture } from './dto/create-facture.dto';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService, ResolveConfig } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Handler custom pour les factures clients.
 * Logique métier :
 *   - Génération du numéro de facture (FAC-YYYY-XXXX-RAND)
 *   - Calcul automatique TVA / TTC à partir de HT + tauxTVA
 *   - Valeurs par défaut (status=BROUILLON, type=HONORAIRES)
 *   - Validation : dossier + client + montant HT > 0
 */
@Injectable()
export class FactureWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
  ) {
    super('factures', dataSource, schemaMetadata, entityResolver);
  }

  // ── Résolution des dépendances ─────────────────────────────────────────────

  /**
   * Surcharge pour corriger deux confusions fréquentes du LLM :
   *
   * 1. Le LLM met le numéro de dossier (DOS-XXXX) dans `procedure_instance`
   *    au lieu de `dossier` — car les deux champs acceptent des identifiants.
   *    → On détecte le pattern DOS- et on redirige vers `dossier`.
   *
   * 2. Le champ `dossier_id` est une colonne brute sans valeur par défaut.
   *    → On résout directement par `dossier_number` si la valeur fournie
   *      ressemble à un numéro de dossier plutôt qu'à un nom/texte libre.
   */
  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: ResolveConfig,
  ): Promise<Record<string, any>> {
    const DOSSIER_NUMBER_PATTERN = /^DOS-/i;

    // Correction : numéro de dossier mis dans procedure_instance par erreur
    if (
      !fields.dossier &&
      fields.procedure_instance &&
      DOSSIER_NUMBER_PATTERN.test(String(fields.procedure_instance))
    ) {
      fields.dossier = fields.procedure_instance;
      delete fields.procedure_instance;
    }

    // Résolution dossier_number → dossier_id + injection automatique client_id
    if (
      !fields.dossier_id &&
      fields.dossier &&
      typeof fields.dossier === 'string' &&
      DOSSIER_NUMBER_PATTERN.test(fields.dossier)
    ) {
      const rows = await this.dataSource.query(
        'SELECT id, client_id FROM dossiers WHERE dossier_number = ? LIMIT 1',
        [fields.dossier.trim()],
      );
      if (rows.length > 0) {
        fields.dossier_id = rows[0].id;
        // client_id hérité du dossier si non fourni explicitement
        if (!fields.client_id && !fields.client) {
          fields.client_id = rows[0].client_id;
        }
        delete fields.dossier; // évite une double résolution par super
      }
    }

    // Même logique si dossier_id est déjà connu mais client_id manquant
    if (fields.dossier_id && !fields.client_id && !fields.client) {
      const rows = await this.dataSource.query(
        'SELECT client_id FROM dossiers WHERE id = ? LIMIT 1',
        [fields.dossier_id],
      );
      if (rows.length > 0) fields.client_id = rows[0].client_id;
    }

    // Auto-injection du contexte de stage visit courant (si le dossier a une procédure)
    if (fields.dossier_id) {
      const stageInfo = await this.fetchCurrentStageVisitInfo(fields.dossier_id);
      if (stageInfo) {
        if (!fields.procedure_instance_id) fields.procedure_instance_id = stageInfo.procedure_instance_id;
        if (!fields.stageVisit_id && stageInfo.stage_visit_id) fields.stageVisit_id = stageInfo.stage_visit_id;
        if (!fields.sub_stage_visit_id && stageInfo.sub_stage_visit_id) fields.sub_stage_visit_id = stageInfo.sub_stage_visit_id;
      }
    }

    return super.resolveDependencies(fields, userId, createdEntities, config);
  }

  // ── Schema enrichi ─────────────────────────────────────────────────────────

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      dossier_id: {
        description: 'ID du dossier associé. Peut aussi fournir "dossier" avec son numéro.',
        example: '12',
        required: true,
      },
      client_id: {
        description: 'ID du client. Peut aussi fournir "client" avec son nom.',
        example: '7',
        required: true,
      },
      type: {
        description: '0=HONORAIRES, 1=FRAIS_PROCEDURE, 2=DILIGENCES, 3=AUTRES',
        example: '0',
      },
      montantHT: {
        description: 'Montant hors taxes (obligatoire pour calcul TVA/TTC)',
        example: '1500.00',
        required: true,
      },
      tauxTVA: {
        description: 'Taux de TVA en %, ex: 20.00 pour 20%',
        example: '20.00',
      },
      status: {
        description: '0=BROUILLON, 1=ENVOYEE, 2=PARTIELLEMENT_PAYEE, 3=PAYEE, 4=IMPAYEE, 5=ANNULEE',
        example: '0',
      },
      dateEcheance: {
        description: 'Date limite de paiement (par défaut: J+30)',
        example: '2026-06-15',
      },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    return fields;
  }

  // ── Validation métier ──────────────────────────────────────────────────────

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (operation === 'INSERT') {
      // dossier_id peut arriver via : FK résolution (alias "dossier"), auto-injection plan,
      // ou valeur directe. La normalisation filterKnownColumns est appliquée avant ici.
      if (!fields.dossier_id) errors.push('Le dossier est requis (dossier_id ou dossier)');
      // if (!fields.client_id) errors.push('Le client est requis (client_id ou client)');

      // montantHT est le property name TypeORM (normalisé par filterKnownColumns)
      const ht = fields.montantHT ?? fields.montant_ht; // fallback sécurité
      if (ht === undefined || ht === null) {
        errors.push('Le montant HT est requis (montant_ht)');
      } else if (Number(ht) <= 0) {
        errors.push('Le montant HT doit être strictement positif');
      }
    } else if (operation === 'UPDATE') {
      const ht = fields.montantHT ?? fields.montant_ht;
      if (ht !== undefined && Number(ht) <= 0) {
        errors.push('Le montant HT doit être strictement positif');
      }
    }

    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  // ── INSERT : génération numéro + calculs financiers ───────────────────────

  protected async doInsert(fields: Record<string, any>, userId: string): Promise<WriteResult> {
    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));

    // Génération numéro FAC-YYYY-XXXX-RAND
    const numero = await this.generateInvoiceNumber();

    // Calculs financiers
    const montantHT = Number(safeFields.montantHT ?? 0);
    const tauxTVA = Number(safeFields.tauxTVA ?? 0);
    const montantTVA = Math.round(montantHT * tauxTVA) / 100;
    const montantTTC = Math.round((montantHT + montantTVA) * 100) / 100;

    // Date d'échéance par défaut = J+30
    const dateFacture = safeFields.dateFacture ? new Date(safeFields.dateFacture) : new Date();
    const dateEcheance = safeFields.dateEcheance
      ? new Date(safeFields.dateEcheance)
      : new Date(dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000);

    const data = {
      ...safeFields,
      numero,
      dateFacture,
      dateEcheance,
      montantHT,
      tauxTVA,
      montantTVA,
      montantTTC,
      type: safeFields.type !== undefined ? Number(safeFields.type) : TypeFacture.HONORAIRES,
      status: safeFields.status !== undefined ? Number(safeFields.status) : StatutFacture.BROUILLON,
    } as any;

    const facture = Object.assign(new Facture(), data);
    const saved = await this.factureRepo.save(facture);

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Facture ${saved.numero} créée (TTC: ${montantTTC.toFixed(2)} €)`,
    };
  }

  // ── UPDATE : préserver numéro, recalculer si HT/tauxTVA modifiés ──────────

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const facture = await this.factureRepo.findOne({ where: { id: entityId as string } });
    if (!facture) throw new NotFoundException(`Facture ${entityId} introuvable`);

    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));
    delete safeFields['numero'];
    delete safeFields['dateFacture'];

    Object.assign(facture, safeFields);

    // Recalcul TVA/TTC si HT ou tauxTVA modifié
    if (safeFields.montantHT !== undefined || safeFields.tauxTVA !== undefined) {
      facture.montantHT = Number(facture.montantHT);
      facture.tauxTVA = Number(facture.tauxTVA);
      facture.montantTVA = Math.round(facture.montantHT * facture.tauxTVA) / 100;
      facture.montantTTC = Math.round((facture.montantHT + facture.montantTVA) * 100) / 100;
    }

    const saved = await this.factureRepo.save(facture);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Facture ${saved.numero} mise à jour`,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.factureRepo.count({
      where: { created_at: Between(new Date(`${year}-01-01`), new Date(`${year}-12-31`)) },
    });
    const seq = (count + 1).toString().padStart(4, '0');
    return `FAC-${year}-${seq}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }
}
