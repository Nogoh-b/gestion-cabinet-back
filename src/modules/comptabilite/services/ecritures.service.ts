import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { JournalComptable } from '../entities/journal.entity';
import { CompteComptable } from '../entities/compte.entity';
import {
  SourceModule,
  StatutEcriture,
  StatutExercice,
  TypeJournal,
} from '../enums/comptabilite.enums';
import { CreateEcritureDto } from '../dto/create-ecriture.dto';
import { InitialisationComptableService } from './initialisation.service';
import { getCurrentTenantId, hasActiveTenant } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';

export interface AccountingActor {
  userId?: string | number | null;
}

@Injectable()
export class EcrituresService {
  constructor(
    @InjectRepository(Ecriture)
    private readonly ecritureRepo: Repository<Ecriture>,
    @InjectRepository(ExerciceComptable)
    private readonly exerciceRepo: Repository<ExerciceComptable>,
    @InjectRepository(JournalComptable)
    private readonly journalRepo: Repository<JournalComptable>,
    @InjectRepository(CompteComptable)
    private readonly compteRepo: Repository<CompteComptable>,
    private readonly initialisation: InitialisationComptableService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async creer(dto: CreateEcritureDto, isAuto = false): Promise<Ecriture> {
    const sourceModule = dto.sourceModule ?? SourceModule.MANUEL;
    if (isAuto && !dto.sourceId) {
      throw new BadRequestException(
        'Une écriture automatique exige un identifiant de source idempotent',
      );
    }
    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      (dto.sourceId
        ? `${sourceModule}:${dto.sourceId}:${dto.codeJournal}`
        : `manual:${randomUUID()}`);
    await this.ensureAccountingReferences(dto);
    return this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const tenantId = getCurrentTenantId();
        const ecritureRepository = manager.getRepository(Ecriture);
        const existing = await ecritureRepository.findOne({
          where: { tenant_id: tenantId, idempotencyKey },
          relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
        });
        if (existing) return existing;

        const dateEcriture = new Date(dto.dateEcriture);
        if (Number.isNaN(dateEcriture.getTime())) {
          throw new BadRequestException("Date d'écriture invalide");
        }
        const annee = dateEcriture.getUTCFullYear();
        const exerciceRepository =
          manager.getRepository(ExerciceComptable);
        let exercice = await exerciceRepository.findOne({
          where: { tenant_id: tenantId, annee },
          lock: { mode: 'pessimistic_write' },
        });
        if (!exercice) {
          try {
            exercice = await exerciceRepository.save(
              exerciceRepository.create({
                tenant_id: tenantId,
                annee,
                dateDebut: new Date(`${annee}-01-01T00:00:00.000Z`),
                dateFin: new Date(`${annee}-12-31T00:00:00.000Z`),
                statut: StatutExercice.OUVERT,
              }),
            );
          } catch (error) {
            if ((error as any)?.code !== 'ER_DUP_ENTRY') throw error;
            exercice = await exerciceRepository.findOne({
              where: { tenant_id: tenantId, annee },
              lock: { mode: 'pessimistic_write' },
            });
          }
        }
        if (!exercice) {
          throw new BadRequestException(
            `L'exercice ${annee} n'a pas pu être réservé`,
          );
        }
        if (exercice.statut === StatutExercice.CLOTURE) {
          throw new BadRequestException(`L'exercice ${annee} est clôturé`);
        }

        const journal = await manager.getRepository(JournalComptable).findOne({
          where: {
            tenant_id: tenantId,
            typeJournal: dto.codeJournal,
          },
          lock: { mode: 'pessimistic_read' },
        });
        if (!journal) {
          throw new BadRequestException(
            `Journal ${dto.codeJournal} introuvable`,
          );
        }

        const lignes: Array<{
          compte_id: number;
          debit: number;
          credit: number;
          libelle: string;
        }> = [];
        for (const line of dto.lignes) {
          const compte = await manager.getRepository(CompteComptable).findOne({
            where: {
              tenant_id: tenantId,
              numero: line.numeroCompte,
            },
            lock: { mode: 'pessimistic_read' },
          });
          if (!compte) {
            throw new BadRequestException(
              `Compte ${line.numeroCompte} introuvable`,
            );
          }
          const debitMinor = this.toMinorUnits(line.debit);
          const creditMinor = this.toMinorUnits(line.credit);
          if (
            (debitMinor === 0 && creditMinor === 0) ||
            (debitMinor > 0 && creditMinor > 0)
          ) {
            throw new BadRequestException(
              'Chaque ligne doit porter un débit ou un crédit, exclusivement',
            );
          }
          lignes.push({
            compte_id: compte.id,
            debit: this.fromMinorUnits(debitMinor),
            credit: this.fromMinorUnits(creditMinor),
            libelle: line.libelle ?? dto.libelle,
          });
        }
        this.assertBalancedLines(lignes);
        const sequence = await this.allocateSequence(
          manager,
          journal.code,
          annee,
        );
        const numero =
          `${journal.code}-${annee}-` +
          `${String(sequence).padStart(5, '0')}`;
        const status = isAuto
          ? StatutEcriture.POSTED
          : StatutEcriture.DRAFT;
        const ecriture = ecritureRepository.create({
          tenant_id: tenantId,
          numero,
          dateEcriture,
          libelle: dto.libelle,
          journal_id: journal.id,
          exercice_id: exercice.id,
          sourceModule,
          sourceId: dto.sourceId,
          isAutoGenerated: isAuto,
          isLocked: isAuto,
          status,
          postedAt: isAuto ? new Date() : null,
          reversedAt: null,
          reversalOfId: null,
          reversalReason: null,
          idempotencyKey,
          lignes,
        });
        try {
          return await ecritureRepository.save(ecriture);
        } catch (error) {
          if ((error as any)?.code !== 'ER_DUP_ENTRY') throw error;
          const duplicate = await ecritureRepository.findOne({
            where: { tenant_id: tenantId, idempotencyKey },
            relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
          });
          if (duplicate) return duplicate;
          throw error;
        }
      },
    );
  }

  findAll(filters: Record<string, any> = {}): Promise<Ecriture[]> {
    return this.ecritureRepo.find({
      where: this.withTenant(filters),
      relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
      order: { dateEcriture: 'DESC', id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Ecriture> {
    const e = await this.ecritureRepo.findOne({
      where: this.withTenant({ id }),
      relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
    });
    if (!e) throw new NotFoundException(`Écriture ${id} introuvable`);
    return e;
  }

  findBySource(sourceModule: SourceModule, sourceId: string): Promise<Ecriture[]> {
    return this.ecritureRepo.find({
      where: this.withTenant({ sourceModule, sourceId }),
      relations: ['journal', 'lignes', 'lignes.compte'],
    });
  }

  /**
   * Teste si un document source a déjà été comptabilisé dans un journal donné.
   * Sert de garde d'idempotence pour les écritures automatiques (événements +
   * synchronisation initiale) afin de ne jamais créer de doublon.
   */
  async existeParSource(sourceModule: SourceModule, sourceId: string, codeJournal?: TypeJournal): Promise<boolean> {
    const qb = this.ecritureRepo
      .createQueryBuilder('e')
      .where('e.source_module = :sm', { sm: sourceModule })
      .andWhere('e.source_id = :sid', { sid: sourceId });
    this.applyTenantScope(qb, 'e');
    if (codeJournal) {
      qb.innerJoin('e.journal', 'j').andWhere('j.typeJournal = :tj', { tj: codeJournal });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  async poster(
    id: number,
    actor: AccountingActor = {},
  ): Promise<Ecriture> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Ecriture);
      const ecriture = await repository.findOne({
        where: { id, tenant_id: getCurrentTenantId() },
        relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!ecriture) throw new NotFoundException(`Écriture ${id} introuvable`);
      if (ecriture.status !== StatutEcriture.DRAFT) {
        throw new BadRequestException(
          'Seule une écriture brouillon peut être comptabilisée',
        );
      }
      if (ecriture.exercice?.statut === StatutExercice.CLOTURE) {
        throw new BadRequestException(
          `L'exercice ${ecriture.exercice.annee} est clôturé`,
        );
      }
      this.assertBalancedLines(ecriture.lignes);
      ecriture.status = StatutEcriture.POSTED;
      ecriture.postedAt = new Date();
      ecriture.isLocked = true;
      const saved = await repository.save(ecriture);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? null,
        action: 'accounting.entry.posted',
        resourceType: 'accounting_entry',
        resourceId: saved.id,
        beforeState: { status: StatutEcriture.DRAFT },
        afterState: {
          status: saved.status,
          numero: saved.numero,
          postedAt: saved.postedAt,
        },
      });
      return saved;
    });
  }

  async contrepasser(
    id: number,
    rawReason: string,
    actor: AccountingActor = {},
  ): Promise<Ecriture> {
    const reason = rawReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Ecriture);
      const original = await repository.findOne({
        where: { id, tenant_id: getCurrentTenantId() },
        relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!original) throw new NotFoundException(`Écriture ${id} introuvable`);

      const existingReversal = await repository.findOne({
        where: {
          tenant_id: getCurrentTenantId(),
          reversalOfId: original.id,
        },
        relations: ['journal', 'exercice', 'lignes', 'lignes.compte'],
      });
      if (existingReversal) return existingReversal;
      if (original.status !== StatutEcriture.POSTED) {
        throw new BadRequestException(
          'Seule une écriture comptabilisée peut être contrepassée',
        );
      }
      this.assertBalancedLines(original.lignes);

      const now = new Date();
      const fiscalYear = now.getUTCFullYear();
      const exercice = await manager.getRepository(ExerciceComptable).findOne({
        where: {
          tenant_id: getCurrentTenantId(),
          annee: fiscalYear,
          statut: StatutExercice.OUVERT,
        },
        lock: { mode: 'pessimistic_read' },
      });
      if (!exercice) {
        throw new BadRequestException(
          `Aucun exercice ouvert pour la contrepassation en ${fiscalYear}`,
        );
      }
      const sequence = await this.allocateSequence(
        manager,
        original.journal.code,
        fiscalYear,
      );
      const reversal = repository.create({
        numero: `${original.journal.code}-${fiscalYear}-${String(sequence).padStart(5, '0')}`,
        dateEcriture: now,
        libelle: `Contrepassation ${original.numero} — ${reason}`,
        journal_id: original.journal_id,
        exercice_id: exercice.id,
        sourceModule: SourceModule.MANUEL,
        sourceId: `reversal:${original.id}`,
        isAutoGenerated: true,
        isLocked: true,
        status: StatutEcriture.POSTED,
        postedAt: now,
        reversalOfId: original.id,
        reversalReason: reason,
        idempotencyKey: `reversal:${original.id}`,
        lignes: original.lignes.map((line) => ({
          compte_id: line.compte_id,
          debit: Number(line.credit),
          credit: Number(line.debit),
          libelle: `Contrepassation — ${line.libelle ?? original.libelle}`,
        })),
      });
      const savedReversal = await repository.save(reversal);
      original.status = StatutEcriture.REVERSED;
      original.reversedAt = now;
      original.isLocked = true;
      await repository.save(original);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? null,
        action: 'accounting.entry.reversed',
        resourceType: 'accounting_entry',
        resourceId: original.id,
        beforeState: { status: StatutEcriture.POSTED },
        afterState: {
          status: original.status,
          reversalEntryId: savedReversal.id,
        },
        justification: reason,
      });
      return savedReversal;
    });
  }

  async search(params: {
    journalId?: number;
    exerciceId?: number;
    sourceModule?: SourceModule;
    dateDebut?: string;
    dateFin?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Ecriture[]; total: number }> {
    const qb = this.ecritureRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.journal', 'journal')
      .leftJoinAndSelect('e.exercice', 'exercice')
      .leftJoinAndSelect('e.lignes', 'lignes')
      .leftJoinAndSelect('lignes.compte', 'compte')
      .orderBy('e.dateEcriture', 'DESC')
      .addOrderBy('e.id', 'DESC');
    this.applyTenantScope(qb, 'e');

    if (params.journalId)    qb.andWhere('e.journal_id = :jid',   { jid: params.journalId });
    if (params.exerciceId)   qb.andWhere('e.exercice_id = :eid',  { eid: params.exerciceId });
    if (params.sourceModule) qb.andWhere('e.source_module = :sm', { sm: params.sourceModule });
    if (params.dateDebut)    qb.andWhere('e.date_ecriture >= :dd', { dd: params.dateDebut });
    if (params.dateFin)      qb.andWhere('e.date_ecriture <= :df', { df: params.dateFin });

    const limit = params.limit ?? 50;
    const page  = params.page  ?? 1;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private async ensureAccountingReferences(
    dto: CreateEcritureDto,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    const journal = await this.journalRepo.findOne({
      where: { tenant_id: tenantId, typeJournal: dto.codeJournal },
      select: ['id'],
    });
    let missingAccount = false;
    for (const number of [
      ...new Set(dto.lignes.map((line) => line.numeroCompte)),
    ]) {
      const account = await this.compteRepo.findOne({
        where: { tenant_id: tenantId, numero: number },
        select: ['id'],
      });
      if (!account) {
        missingAccount = true;
        break;
      }
    }
    if (!journal || missingAccount) {
      await this.initialisation.initialiser();
    }
  }

  private async genererNumero(
    codeJournal: string,
    annee: number,
  ): Promise<string> {
    const prefix = `${codeJournal}-${annee}-`;
    const sequence = await this.dataSource.transaction((manager) =>
      this.allocateSequence(manager, codeJournal, annee),
    );
    return `${prefix}${String(sequence).padStart(5, '0')}`;
  }

  private async allocateSequence(
    manager: EntityManager,
    journalCode: string,
    fiscalYear: number,
  ): Promise<number> {
    const tenantId = getCurrentTenantId();
    await manager.query(
      `INSERT IGNORE INTO accounting_number_sequences
         (tenant_id, journal_code, fiscal_year, next_value)
       VALUES (?, ?, ?, 1)`,
      [tenantId, journalCode, fiscalYear],
    );
    const rows = await manager.query(
      `SELECT next_value
       FROM accounting_number_sequences
       WHERE tenant_id = ? AND journal_code = ? AND fiscal_year = ?
       FOR UPDATE`,
      [tenantId, journalCode, fiscalYear],
    );
    const sequence = Number(rows?.[0]?.next_value);
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      throw new BadRequestException(
        'La séquence de numérotation comptable est invalide',
      );
    }
    await manager.query(
      `UPDATE accounting_number_sequences
       SET next_value = next_value + 1
       WHERE tenant_id = ? AND journal_code = ? AND fiscal_year = ?`,
      [tenantId, journalCode, fiscalYear],
    );
    return sequence;
  }

  private assertBalancedLines(
    lines: Array<{ debit: number; credit: number }>,
  ): void {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new BadRequestException(
        'Une écriture doit contenir au moins deux lignes',
      );
    }
    let debitMinor = 0;
    let creditMinor = 0;
    for (const line of lines) {
      const debit = this.toMinorUnits(line.debit);
      const credit = this.toMinorUnits(line.credit);
      if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
        throw new BadRequestException(
          'Chaque ligne doit porter un débit ou un crédit, exclusivement',
        );
      }
      debitMinor += debit;
      creditMinor += credit;
    }
    if (debitMinor === 0 || debitMinor !== creditMinor) {
      throw new BadRequestException('L’écriture comptable est déséquilibrée');
    }
  }

  private toMinorUnits(value: number | string): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new BadRequestException('Montant comptable invalide');
    }
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Les montants comptables utilisent au plus deux décimales',
      );
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }

  private withTenant<T extends Record<string, any>>(where: T): T & { tenant_id?: number } {
    return hasActiveTenant() ? { ...where, tenant_id: getCurrentTenantId() } : where;
  }

  private applyTenantScope(qb: any, alias: string): void {
    if (hasActiveTenant()) {
      qb.andWhere(`${alias}.tenant_id = :tenantId`, { tenantId: getCurrentTenantId() });
    }
  }
}
