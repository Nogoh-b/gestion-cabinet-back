// src/modules/paiement/paiement-write.handler.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Paiement } from './entities/paiement.entity';
import { ModePaiement, StatutPaiement } from './dto/create-paiement.dto';
import { Facture } from '../facture/entities/facture.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import {
  EntityResolverService,
  ResolveConfig,
} from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { comparableKey } from 'src/core/ai-database/write/lenient-values';
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';

/** Facture du paiement, sous l'un de ses noms (`factureId`, `facture_id`, relation `facture`). */
function factureIdOf(fields: Record<string, any>): string | undefined {
  const raw = fields.factureId ?? fields.facture_id ?? fields.facture;
  const id = raw && typeof raw === 'object' ? raw.id : raw;
  return id === undefined || id === null || id === '' ? undefined : String(id);
}

/**
 * Handler custom pour les paiements clients.
 * Logique métier :
 *   - Facture obligatoire (FK validée)
 *   - Montant > 0
 *   - Status par défaut : VALIDE (paiement enregistré = encaissé)
 *   - Après INSERT/UPDATE : recalcule le status de la facture parente
 *     (ENVOYEE / PARTIELLEMENT_PAYEE / PAYEE)
 */
@Injectable()
export class PaiementWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
  ) {
    super('paiements', dataSource, schemaMetadata, entityResolver);
  }

  // ── Schema enrichi ─────────────────────────────────────────────────────────

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    // Le schéma expose la jointure sous `facture_id` (pas de colonne `factureId`).
    const factureField: Partial<WriteableFieldSchema> = {
      description:
        'ID (UUID) de la facture associée : celui de la facture mentionnée (id=…). Peut aussi fournir "facture" avec son numéro.',
      example: '6f1c…-uuid',
      required: true,
    };
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      facture_id: factureField,
      factureId: factureField,
      montant: {
        description:
          'Montant payé (> 0). Doit être ≤ reste à payer de la facture.',
        example: '1500.00',
        required: true,
      },
      modePaiement: {
        description:
          'BD: 0=VIREMENT, 1=CHEQUE, 2=ESPECES, 3=CARTE, 4=PRELEVEMENT, 5=Mobile, 6=AUTRE.',
        example: '0',
      },
      status: {
        description: 'BD: 0=EN_ATTENTE, 1=VALIDE, 2=REJETE, 3=ANNULE.',
        example: '1',
      },
      datePaiement: {
        description: "Date du paiement (par défaut: aujourd'hui)",
        example: '2026-05-15',
      },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    return fields;
  }

  // ── Mode / statut en toutes lettres ───────────────────────────────────────

  /**
   * Le formulaire envoie des codes ; le LLM écrit « Orange Money », « chèque »,
   * « validé »… On les traduit avant la conversion générique des enums.
   */
  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = await super.resolveDependencies(
      fields,
      userId,
      createdEntities,
      config,
    );
    const modeKey = [
      'modePaiement',
      'mode_paiement',
      'modePaiment',
      'mode',
    ].find((k) => resolved[k] !== undefined && resolved[k] !== null);
    if (modeKey) {
      const mode = this.toPaymentMode(resolved[modeKey]);
      if (modeKey !== 'modePaiement') delete resolved[modeKey];
      if (mode !== undefined) resolved.modePaiement = mode;
    }
    if (resolved.status !== undefined && resolved.status !== null) {
      const status = this.toPaymentStatus(resolved.status);
      if (status !== undefined) resolved.status = status;
    }
    return resolved;
  }

  private toPaymentMode(value: any): ModePaiement | any {
    const key = comparableKey(value);
    const synonyms: Array<[RegExp, ModePaiement]> = [
      [/virement|transfert|bancaire|wire|transfer/, ModePaiement.VIREMENT],
      [/cheque|check/, ModePaiement.CHEQUE],
      [/espece|cash|liquide|numeraire/, ModePaiement.ESPECES],
      [/carte|cb|visa|mastercard|card/, ModePaiement.CARTE],
      [/prelevement|debit/, ModePaiement.PRELEVEMENT],
      [/mobile|momo|orange|mtn|wave|money|airtel/, ModePaiement.Mobile],
    ];
    for (const [pattern, mode] of synonyms) if (pattern.test(key)) return mode;
    return value; // code numérique ou nom exact : laissé à la conversion générique
  }

  private toPaymentStatus(value: any): StatutPaiement | any {
    const key = comparableKey(value);
    if (/attente|pending/.test(key)) return StatutPaiement.EN_ATTENTE;
    if (/^(valid|encaiss|recu|paye|confirm)/.test(key))
      return StatutPaiement.VALIDE;
    if (/rejet|refus|reject/.test(key)) return StatutPaiement.REJETE;
    if (/annul|cancel/.test(key)) return StatutPaiement.ANNULE;
    return value;
  }

  // ── Validation métier ──────────────────────────────────────────────────────

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (operation === 'INSERT') {
      if (!factureIdOf(fields)) {
        errors.push('La facture est requise (factureId ou facture)');
      }
      if (fields.montant === undefined || fields.montant === null) {
        errors.push('Le montant est requis');
      } else if (Number(fields.montant) <= 0) {
        errors.push('Le montant doit être strictement positif');
      }
    } else if (operation === 'UPDATE') {
      if (fields.montant !== undefined && Number(fields.montant) <= 0) {
        errors.push('Le montant doit être strictement positif');
      }
    }

    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  // ── INSERT : validation facture + création + maj status facture ───────────

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const safeFields = this.stripAutoGeneratedFields(
      this.filterKnownColumns(fields),
    );

    // Normaliser FK : filterKnownColumns renomme `facture_id` en `facture`
    // (propriété de la relation).
    const factureId = factureIdOf(safeFields);
    if (!factureId)
      throw new BadRequestException('factureId manquant après résolution');
    delete safeFields.facture;
    delete safeFields.facture_id;

    const facture = await this.factureRepo.findOne({
      where: { id: factureId as string },
      relations: ['paiements'],
    });
    if (!facture)
      throw new NotFoundException(`Facture ${factureId} introuvable`);

    const montant = Number(safeFields.montant);
    const status =
      safeFields.status !== undefined
        ? Number(safeFields.status)
        : StatutPaiement.VALIDE;

    // Refuser dépassement du reste à payer — comme PaiementService, seulement
    // pour un paiement validé (un paiement en attente ne solde rien).
    const dejaPaye = (facture.paiements ?? [])
      .filter((p) => Number(p.status) === StatutPaiement.VALIDE)
      .reduce((s, p) => s + Number(p.montant), 0);
    const resteAPayer = Number(facture.montantTTC) - dejaPaye;

    if (status === StatutPaiement.VALIDE && montant > resteAPayer + 0.01) {
      throw new BadRequestException(
        `Le montant ${montant.toFixed(2)} € dépasse le reste à payer (${resteAPayer.toFixed(2)} €)`,
      );
    }

    const data = {
      ...safeFields,
      factureId, // passe par le setter → this.facture = { id: factureId }
      montant,
      datePaiement: safeFields.datePaiement
        ? new Date(safeFields.datePaiement)
        : new Date(),
      dateValeur: safeFields.dateValeur
        ? new Date(safeFields.dateValeur)
        : new Date(),
      modePaiement:
        safeFields.modePaiement !== undefined
          ? Number(safeFields.modePaiement)
          : ModePaiement.ESPECES,
      status,
    } as any;

    const paiement = Object.assign(new Paiement(), data);
    const saved = await this.paiementRepo.save(paiement);

    // Mise à jour du status de la facture parente
    await this.updateFactureStatus(factureId);

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Paiement de ${montant.toFixed(2)} € enregistré sur la facture ${facture.numero}`,
    };
  }

  // ── UPDATE : maj paiement + recalcul status facture ───────────────────────

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const paiement = await this.paiementRepo.findOne({
      where: { id: entityId as any },
    });
    if (!paiement)
      throw new NotFoundException(`Paiement ${entityId} introuvable`);

    const safeFields = this.stripAutoGeneratedFields(
      this.filterKnownColumns(fields),
    );
    Object.assign(paiement, safeFields);
    const saved = await this.paiementRepo.save(paiement);

    await this.updateFactureStatus(paiement.factureId);

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Paiement ${entityId} mis à jour`,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Recalcule le status de la facture parente en fonction des paiements VALIDES */
  private async updateFactureStatus(
    factureId: string,
  ): Promise<Facture | null> {
    const facture = await this.factureRepo.findOne({
      where: { id: factureId },
      relations: ['paiements', 'client'],
    });
    if (!facture) return null;

    const totalPaye = (facture.paiements ?? [])
      .filter((p) => p.status === StatutPaiement.VALIDE)
      .reduce((s, p) => s + Number(p.montant), 0);

    const ttc = Number(facture.montantTTC);
    let newStatus = facture.status;
    if (totalPaye === 0) {
      newStatus = StatutFacture.ENVOYEE;
    } else if (totalPaye < ttc) {
      newStatus = StatutFacture.PARTIELLEMENT_PAYEE;
    } else if (totalPaye >= ttc) {
      newStatus = StatutFacture.PAYEE;
    }

    if (newStatus !== facture.status) {
      facture.status = newStatus;
      await this.factureRepo.save(facture);
      this.logger.log(
        `📊 Status facture ${facture.numero} → ${StatutFacture[newStatus]}`,
      );
    }

    return facture;
  }
}
