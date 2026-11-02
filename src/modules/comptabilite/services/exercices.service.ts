import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExerciceComptable } from '../entities/exercice.entity';
import { Ecriture } from '../entities/ecriture.entity';
import {
  StatutEcriture,
  StatutExercice,
} from '../enums/comptabilite.enums';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';
import { CloseExerciceDto } from '../dto/close-exercice.dto';

export interface ExerciseActor {
  userId?: string | number | null;
}

@Injectable()
export class ExercicesService {
  constructor(
    @InjectRepository(ExerciceComptable)
    private readonly repo: Repository<ExerciceComptable>,
    @InjectRepository(Ecriture)
    private readonly ecritureRepo: Repository<Ecriture>,
    private readonly auditService: AuditService,
  ) {}

  findAll(): Promise<ExerciceComptable[]> {
    return this.repo.find({
      where: { tenant_id: getCurrentTenantId() },
      order: { annee: 'DESC' },
    });
  }

  async findOuvert(): Promise<ExerciceComptable> {
    const exercice = await this.repo.findOne({
      where: {
        tenant_id: getCurrentTenantId(),
        statut: StatutExercice.OUVERT,
      },
      order: { annee: 'DESC' },
    });
    if (!exercice) throw new NotFoundException('Aucun exercice comptable ouvert');
    return exercice;
  }

  async create(
    annee: number,
    actor: ExerciseActor = {},
  ): Promise<ExerciceComptable> {
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2200) {
      throw new BadRequestException("L'année de l'exercice est invalide");
    }
    return this.repo.manager.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const repository = manager.getRepository(ExerciceComptable);
      const exists = await repository.findOne({
        where: { tenant_id: tenantId, annee },
        lock: { mode: 'pessimistic_read' },
      });
      if (exists) {
        throw new BadRequestException(`Un exercice existe déjà pour ${annee}`);
      }
      const saved = await repository.save(
        repository.create({
          annee,
          dateDebut: new Date(`${annee}-01-01T00:00:00.000Z`),
          dateFin: new Date(`${annee}-12-31T00:00:00.000Z`),
          statut: StatutExercice.OUVERT,
          tenant_id: tenantId,
        }),
      );
      await this.auditService.append(manager, {
        actorId: actor.userId ?? null,
        action: 'accounting.exercise.opened',
        resourceType: 'accounting_exercise',
        resourceId: saved.id,
        afterState: { year: saved.annee, status: saved.statut },
      });
      return saved;
    });
  }

  async cloturer(
    id: number,
    dto: CloseExerciceDto,
    actor: ExerciseActor = {},
  ): Promise<ExerciceComptable> {
    return this.repo.manager.transaction(async (manager) => {
      const exerciceRepository = manager.getRepository(ExerciceComptable);
      const exercice = await exerciceRepository.findOne({
        where: { id, tenant_id: getCurrentTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!exercice) throw new NotFoundException(`Exercice ${id} introuvable`);
      if (exercice.statut === StatutExercice.CLOTURE) {
        throw new BadRequestException('Cet exercice est déjà clôturé');
      }
      const draftCount = await manager.getRepository(Ecriture).count({
        where: {
          tenant_id: getCurrentTenantId(),
          exercice_id: exercice.id,
          status: StatutEcriture.DRAFT,
        },
      });
      if (draftCount > 0) {
        throw new BadRequestException(
          `Clôture refusée : ${draftCount} écriture(s) brouillon restent à traiter`,
        );
      }
      const imbalances = await manager.query(
        `SELECT e.id
         FROM ecritures_comptables e
         LEFT JOIN lignes_ecriture_comptable l ON l.ecriture_id = e.id
         WHERE e.tenant_id = ? AND e.exercice_id = ?
         GROUP BY e.id
         HAVING COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0)
         LIMIT 1`,
        [getCurrentTenantId(), exercice.id],
      );
      if (imbalances.length > 0) {
        throw new BadRequestException(
          'Clôture refusée : au moins une écriture est déséquilibrée',
        );
      }
      exercice.statut = StatutExercice.CLOTURE;
      exercice.dateCloture = new Date();
      exercice.closingReport = dto.rapportCloture.trim();
      exercice.reconciliationReference =
        dto.referenceRapprochement.trim();
      exercice.closedBy =
        actor.userId == null ? null : String(actor.userId);
      const saved = await exerciceRepository.save(exercice);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? null,
        action: 'accounting.exercise.closed',
        resourceType: 'accounting_exercise',
        resourceId: saved.id,
        beforeState: { status: StatutExercice.OUVERT },
        afterState: {
          status: saved.statut,
          closedAt: saved.dateCloture,
          reconciliationReference: saved.reconciliationReference,
        },
        justification: saved.closingReport,
      });
      return saved;
    });
  }
}
