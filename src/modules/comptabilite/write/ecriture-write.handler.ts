// src/modules/comptabilite/write/ecriture-write.handler.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { CompteComptable } from '../entities/compte.entity';
import { JournalComptable } from '../entities/journal.entity';
import { SourceModule, StatutExercice } from '../enums/comptabilite.enums';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Champ "ligne" attendu dans le tableau fields.lignes d'une écriture.
 */
interface LigneInput {
  compte?: string | number;     // numéro de compte (ex: "411000") ou compte_id
  compte_id?: string | number;
  debit?: number | string;
  credit?: number | string;
  libelle?: string;
}

/**
 * Handler custom pour les écritures comptables (partie double).
 *
 * Logique métier (pas de précédent "header + lignes" dans le codebase, donc
 * tout est géré ici plutôt que via le mécanisme générique tempId du WritePlan,
 * pour garantir l'intégrité de la partie double dans UNE seule transaction) :
 *   - dateEcriture, libelle, journal et lignes (≥ 2, ≥1 débit + ≥1 crédit) obligatoires
 *   - chaque ligne référence un compte par numéro (résolu automatiquement) ou compte_id
 *   - l'exercice est déduit de l'année de dateEcriture (créé automatiquement si absent)
 *   - le numero est généré automatiquement (JOURNAL-ANNEE-SEQUENCE), jamais fourni par l'IA
 *   - validation stricte : total débit === total crédit (tolérance 0.01)
 *   - une écriture verrouillée (isLocked) ne peut plus être modifiée par l'IA
 *   - la suppression/modification des lignes via UPDATE n'est pas autorisée (corrections
 *     comptables = nouvelle écriture de contre-passation, pas une édition destructive)
 */
@Injectable()
export class EcritureWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Ecriture)
    private readonly ecritureRepo: Repository<Ecriture>,
    @InjectRepository(ExerciceComptable)
    private readonly exerciceRepo: Repository<ExerciceComptable>,
    @InjectRepository(CompteComptable)
    private readonly compteRepo: Repository<CompteComptable>,
    @InjectRepository(JournalComptable)
    private readonly journalRepo: Repository<JournalComptable>,
  ) {
    super('ecritures_comptables', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      dateEcriture: { description: 'Date de l\'écriture (YYYY-MM-DD), obligatoire', example: '2026-06-16', required: true },
      libelle: { description: 'Libellé général de l\'écriture, obligatoire', example: 'Facture client n°123', required: true },
      journal: { description: 'Code ou libellé du journal (ex: "VTE" ou "Journal des ventes"), obligatoire', required: true },
      sourceModule: { description: 'Toujours "manuel" pour une écriture saisie via l\'IA' },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    // Champ spécial non-colonne : tableau des lignes de débit/crédit
    fields.push({
      name: 'lignes',
      label: 'Lignes (débit/crédit)',
      type: 'string',
      required: true,
      description:
        'Tableau JSON des lignes de l\'écriture. Chaque ligne: { "compte": "411000" (numéro de compte), ' +
        '"debit": 1000, "credit": 0, "libelle": "..." (optionnel, sinon reprend le libellé général) }. ' +
        'Le total des débits DOIT être égal au total des crédits.',
      example: '[{"compte":"411000","debit":1190,"credit":0},{"compte":"701000","debit":0,"credit":1190}]',
    });
    return fields;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    if (operation === 'INSERT') {
      if (!fields.dateEcriture) errors.push('La date de l\'écriture est requise');
      if (!fields.libelle) errors.push('Le libellé de l\'écriture est requis');
      if (!fields.journal_id && !fields.journal) errors.push('Le journal est requis');

      const lignes = this.parseLignes(fields.lignes);
      if (!lignes || lignes.length < 2) {
        errors.push('Au moins 2 lignes (un débit et un crédit) sont requises pour équilibrer l\'écriture');
      } else {
        const totalDebit = lignes.reduce((s, l) => s + Number(l.debit || 0), 0);
        const totalCredit = lignes.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          errors.push(`Écriture déséquilibrée : débit=${totalDebit} ≠ crédit=${totalCredit}`);
        }
        for (const l of lignes) {
          if (!l.compte && !l.compte_id) errors.push('Chaque ligne doit référencer un compte ("compte" ou "compte_id")');
        }
      }
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  protected async doInsert(fields: Record<string, any>, userId: string): Promise<WriteResult> {
    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));
    const lignesInput = this.parseLignes(fields.lignes) || [];

    // 1. Résoudre le journal (déjà résolu en journal_id par resolveDependencies si "journal" texte fourni)
    const journalId = safeFields.journal_id ?? fields.journal_id;
    if (!journalId) throw new BadRequestException('Journal introuvable pour cette écriture');
    const journal = await this.journalRepo.findOne({ where: { id: journalId } });
    if (!journal) throw new NotFoundException(`Journal ${journalId} introuvable`);

    // 2. Résoudre/créer l'exercice à partir de l'année de la date d'écriture
    const dateEcriture = new Date(safeFields.dateEcriture);
    const annee = dateEcriture.getFullYear();
    let exercice = await this.exerciceRepo.findOne({ where: { annee } });
    if (!exercice) {
      exercice = await this.exerciceRepo.save(this.exerciceRepo.create({
        annee,
        dateDebut: new Date(`${annee}-01-01`),
        dateFin: new Date(`${annee}-12-31`),
        statut: StatutExercice.OUVERT,
      }));
    }
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException(`L'exercice ${annee} est clôturé, impossible d'y ajouter une écriture`);
    }

    // 3. Résoudre chaque ligne (compte par numéro ou ID)
    const lignes: Array<{ compte_id: number; debit: number; credit: number; libelle: string }> = [];
    for (const l of lignesInput) {
      const compte = await this.resolveCompte(l);
      if (!compte) {
        throw new BadRequestException(`Compte introuvable pour la ligne: ${JSON.stringify(l)}`);
      }
      lignes.push({
        compte_id: compte.id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        libelle: l.libelle ?? safeFields.libelle,
      });
    }

    const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(`Écriture déséquilibrée : débit=${totalDebit} ≠ crédit=${totalCredit}`);
    }

    const numero = await this.genererNumero(journal.code);

    const record = this.ecritureRepo.create({
      numero,
      dateEcriture,
      libelle: safeFields.libelle,
      journal_id: journal.id,
      exercice_id: exercice.id,
      sourceModule: safeFields.sourceModule ?? SourceModule.MANUEL,
      sourceId: safeFields.sourceId,
      isAutoGenerated: false,
      lignes,
    });

    let saved: Ecriture;
    try {
      saved = await this.ecritureRepo.save(record);
    } catch (error) {
      throw new BadRequestException(this.translateDbError(error));
    }

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Écriture "${saved.numero}" créée (débit=${totalDebit}, crédit=${totalCredit})`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const ecriture = await this.ecritureRepo.findOne({ where: { id: entityId as any }, relations: ['lignes'] });
    if (!ecriture) throw new NotFoundException(`Écriture ${entityId} introuvable`);
    if (ecriture.isLocked) {
      throw new BadRequestException(`L'écriture ${ecriture.numero} est verrouillée et ne peut plus être modifiée`);
    }

    // Seuls les champs d'en-tête sont modifiables via l'IA — les lignes (partie
    // double) ne se corrigent pas par édition mais par contre-passation.
    const safeFields = this.filterKnownColumns(fields);
    delete (safeFields as any).numero;
    delete (safeFields as any).journalId;
    delete (safeFields as any).exerciceId;
    delete (safeFields as any).lignes;

    Object.assign(ecriture, safeFields);

    let saved: Ecriture;
    try {
      saved = await this.ecritureRepo.save(ecriture);
    } catch (error) {
      throw new BadRequestException(this.translateDbError(error));
    }

    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Écriture "${saved.numero}" mise à jour`,
    };
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────

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

  private async resolveCompte(l: LigneInput): Promise<CompteComptable | null> {
    if (l.compte_id) {
      return this.compteRepo.findOne({ where: { id: Number(l.compte_id) } });
    }
    if (l.compte !== undefined) {
      if (/^\d+$/.test(String(l.compte)) && String(l.compte).length <= 3) {
        // Probablement un ID interne plutôt qu'un numéro de compte (numéros SYSCOHADA ont 6 chiffres)
        const byId = await this.compteRepo.findOne({ where: { id: Number(l.compte) } });
        if (byId) return byId;
      }
      const byNumero = await this.compteRepo.findOne({ where: { numero: String(l.compte) } });
      if (byNumero) return byNumero;
      // Fallback : recherche par libellé
      return this.compteRepo
        .createQueryBuilder('c')
        .where('c.libelle LIKE :term', { term: `%${l.compte}%` })
        .getOne();
    }
    return null;
  }

  private async genererNumero(codeJournal: string): Promise<string> {
    const annee = new Date().getFullYear();
    const prefix = `${codeJournal}-${annee}-`;
    const last = await this.ecritureRepo
      .createQueryBuilder('e')
      .where('e.numero LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('e.numero', 'DESC')
      .getOne();

    const lastSequence = last?.numero?.startsWith(prefix)
      ? Number(last.numero.slice(prefix.length))
      : 0;
    let sequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const numero = `${prefix}${String(sequence).padStart(5, '0')}`;
      const exists = await this.ecritureRepo.findOne({ where: { numero } });
      if (!exists) return numero;
      sequence += 1;
    }

    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }
}
