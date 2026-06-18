// src/modules/comptabilite/write/ecriture-write.handler.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Ecriture } from '../entities/ecriture.entity';
import { CompteComptable } from '../entities/compte.entity';
import { TypeJournal } from '../enums/comptabilite.enums';
import { CreateEcritureDto, CreateLigneDto } from '../dto/create-ecriture.dto';
import { EcrituresService } from '../services/ecritures.service';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteIntent } from 'src/core/ai-database/interface/write-intent.interface';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Ligne attendue dans le tableau fields.lignes fourni par l'IA.
 */
interface LigneInput {
  compte?: string | number;     // numéro de compte (ex: "411000") ou compte_id
  compte_id?: string | number;
  debit?: number | string;
  credit?: number | string;
  libelle?: string;
}

/**
 * Adaptateur d'écriture IA pour les écritures comptables.
 *
 * ⚠️ SÉPARATION LOGIQUE MÉTIER / COMPOSANT :
 * Ce handler ne contient AUCUNE règle comptable. Il se contente de TRADUIRE les
 * champs produits par l'IA en `CreateEcritureDto`, puis délègue à
 * `EcrituresService.creer()`, seule détentrice de la logique métier
 * (résolution/auto-création de l'exercice, résolution du journal et des comptes,
 * contrôle d'équilibre débit=crédit, génération du numéro, garde exercice clôturé…).
 * Si le domaine comptable évolue, seul le service change — ce composant reste stable.
 */
@Injectable()
export class EcritureWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Ecriture)
    private readonly ecritureRepo: Repository<Ecriture>,
    @InjectRepository(CompteComptable)
    private readonly compteRepo: Repository<CompteComptable>,
    private readonly ecrituresService: EcrituresService,
  ) {
    super('ecritures_comptables', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      dateEcriture: { description: 'Date de l\'écriture (YYYY-MM-DD), obligatoire', example: '2026-06-16', required: true },
      libelle: { description: 'Libellé général de l\'écriture, obligatoire', example: 'Facture client n°123', required: true },
      journal: { description: 'Code ou nom du journal (VTE/VENTES, ACH/ACHATS, CAI/CAISSE, BAN/BANQUE, OD), obligatoire', required: true },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    // Champ spécial (non-colonne) : tableau des lignes débit/crédit
    fields.push({
      name: 'lignes',
      label: 'Lignes (débit/crédit)',
      type: 'string',
      required: true,
      description:
        'Tableau JSON des lignes. Chaque ligne: { "compte": "411000" (numéro de compte SYSCOHADA), ' +
        '"debit": 1190, "credit": 0, "libelle": "..." (optionnel) }. ' +
        'Le total des débits DOIT égaler le total des crédits (partie double).',
      example: '[{"compte":"411000","debit":1190,"credit":0},{"compte":"701000","debit":0,"credit":1190}]',
    });
    return fields;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    // Validation STRUCTURELLE uniquement (présence des champs et forme du tableau).
    // L'équilibre comptable, l'existence du journal/des comptes et l'exercice
    // sont validés par EcrituresService — on ne duplique pas ces règles ici.
    const errors: string[] = [];
    if (operation === 'INSERT') {
      if (!fields.dateEcriture) errors.push('La date de l\'écriture est requise');
      if (!fields.libelle) errors.push('Le libellé de l\'écriture est requis');
      if (!fields.journal && !fields.journal_id) errors.push('Le journal est requis');
      const lignes = this.parseLignes(fields.lignes);
      if (!lignes || lignes.length < 2) {
        errors.push('Au moins 2 lignes (un débit et un crédit) sont requises');
      } else if (lignes.some(l => !l.compte && !l.compte_id)) {
        errors.push('Chaque ligne doit référencer un compte ("compte" = numéro de compte)');
      }
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  /**
   * On court-circuite le pipeline générique de BaseWriteHandler (résolution FK
   * auto, filterKnownColumns qui supprimerait "lignes", etc.) car la création
   * d'une écriture passe par le service métier, pas par un simple repo.save().
   */
  async execute(intent: WriteIntent, userId: string): Promise<WriteResult> {
    switch (intent.operation) {
      case 'INSERT':
        return this.creerViaService(intent.fields, userId);
      case 'UPDATE':
        return this.majEnTete(intent.entityId, intent.fields, userId);
      case 'DELETE':
        throw new BadRequestException(
          'La suppression d\'une écriture via l\'IA n\'est pas autorisée. ' +
          'Une correction comptable se fait par une écriture de contre-passation.',
        );
      default:
        throw new BadRequestException(`Opération inconnue: ${intent.operation}`);
    }
  }

  // ─── CRÉATION : délègue intégralement au service métier ──────────────────

  private async creerViaService(fields: Record<string, any>, _userId: string): Promise<WriteResult> {
    const validation = await this.validateFields(fields, 'INSERT');
    if (!validation.valid) {
      throw new BadRequestException(`Validation échouée: ${validation.errors?.join(', ')}`);
    }

    const dto = await this.toCreateDto(fields);
    let ecriture: Ecriture;
    try {
      ecriture = await this.ecrituresService.creer(dto); // ← toute la logique métier est ici
    } catch (error: any) {
      // Relaye le message métier (équilibre, journal/compte introuvable, exercice clôturé…)
      throw new BadRequestException(error?.message ?? 'Impossible de créer l\'écriture');
    }

    return {
      success: true,
      operation: 'INSERT',
      entityId: ecriture.id,
      affected: 1,
      data: ecriture,
      message: `Écriture "${ecriture.numero}" créée (débit=${ecriture.totalDebit}, crédit=${ecriture.totalCredit})`,
    };
  }

  /**
   * Traduit les champs IA en CreateEcritureDto. Pure conversion d'entrée
   * (normalisation), sans règle comptable.
   */
  private async toCreateDto(fields: Record<string, any>): Promise<CreateEcritureDto> {
    const lignesInput = this.parseLignes(fields.lignes) ?? [];
    const lignes: CreateLigneDto[] = [];
    for (const l of lignesInput) {
      lignes.push({
        numeroCompte: await this.toNumeroCompte(l),
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
        libelle: l.libelle,
      });
    }

    return {
      dateEcriture: this.toDateString(fields.dateEcriture),
      libelle: String(fields.libelle),
      codeJournal: this.toTypeJournal(fields.journal ?? fields.journal_id),
      lignes,
    };
  }

  // ─── MISE À JOUR : en-tête uniquement (métadonnée, pas de logique comptable) ──

  private async majEnTete(
    entityId: string | number | undefined,
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    if (!entityId) throw new NotFoundException('Identifiant de l\'écriture manquant');
    const ecriture = await this.ecritureRepo.findOne({ where: { id: entityId as any } });
    if (!ecriture) throw new NotFoundException(`Écriture ${entityId} introuvable`);
    if (ecriture.isLocked) {
      throw new BadRequestException(`L'écriture ${ecriture.numero} est verrouillée et ne peut plus être modifiée.`);
    }

    // Seuls libellé/date d'en-tête sont éditables ; les lignes (partie double)
    // ne se corrigent pas par édition → contre-passation.
    if (fields.libelle !== undefined) ecriture.libelle = String(fields.libelle);
    if (fields.dateEcriture !== undefined) ecriture.dateEcriture = new Date(this.toDateString(fields.dateEcriture));

    const saved = await this.ecritureRepo.save(ecriture);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Écriture "${saved.numero}" mise à jour (en-tête)`,
    };
  }

  // ─── HELPERS DE TRADUCTION (entrée IA → types du domaine) ────────────────

  private parseLignes(raw: any): LigneInput[] | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Résout le numéro de compte à partir d'un numéro (direct) ou d'un compte_id. */
  private async toNumeroCompte(l: LigneInput): Promise<string> {
    if (l.compte_id !== undefined) {
      const c = await this.compteRepo.findOne({ where: { id: Number(l.compte_id) } });
      if (c) return c.numero;
    }
    if (l.compte !== undefined) {
      const val = String(l.compte).trim();
      // Numéro SYSCOHADA (≥ 4 chiffres) → tel quel ; le service résoudra/réparera.
      if (/^\d{4,}$/.test(val)) return val;
      // Petit entier → probablement un compte_id interne
      if (/^\d{1,3}$/.test(val)) {
        const c = await this.compteRepo.findOne({ where: { id: Number(val) } });
        if (c) return c.numero;
      }
      // Sinon, tentative par libellé
      const byLibelle = await this.compteRepo
        .createQueryBuilder('c')
        .where('c.libelle LIKE :term', { term: `%${val}%` })
        .getOne();
      if (byLibelle) return byLibelle.numero;
      return val; // laisse le service lever une erreur claire si introuvable
    }
    throw new BadRequestException('Chaque ligne doit préciser un compte');
  }

  private toDateString(value: any): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
  }

  /** Normalise un code/nom de journal fourni par l'IA vers l'enum TypeJournal. */
  private toTypeJournal(value: any): TypeJournal {
    const v = String(value ?? '').trim().toUpperCase();
    if (['VTE', 'VENTE', 'VENTES', 'VENTE(S)'].includes(v) || v.includes('VENTE')) return TypeJournal.VENTES;
    if (['ACH', 'ACHAT', 'ACHATS'].includes(v) || v.includes('ACHAT')) return TypeJournal.ACHATS;
    if (['CAI', 'CAISSE'].includes(v) || v.includes('CAISSE')) return TypeJournal.CAISSE;
    if (['BAN', 'BANQUE'].includes(v) || v.includes('BANQUE')) return TypeJournal.BANQUE;
    if (['OD', 'DIVERS', 'OPERATIONS DIVERSES'].includes(v) || v.includes('DIVERS')) return TypeJournal.OD;
    // Valeur déjà conforme à l'enum ?
    if ((Object.values(TypeJournal) as string[]).includes(v)) return v as TypeJournal;
    return TypeJournal.OD; // repli neutre : opérations diverses
  }
}
