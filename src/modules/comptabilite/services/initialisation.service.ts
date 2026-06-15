import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompteComptable } from '../entities/compte.entity';
import { JournalComptable } from '../entities/journal.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { StatutExercice } from '../enums/comptabilite.enums';
import { COMPTES_SYSCOHADA, JOURNAUX_SYSCOHADA } from '../data/syscohada.data';
import { getCurrentTenantId, hasActiveTenant } from 'src/core/tenant/tenant.context';

/**
 * Initialise le plan comptable d'UN tenant : plan SYSCOHADA, journaux,
 * exercice courant.
 *
 * IMPORTANT — multi-tenant :
 * Doit être appelé DANS un contexte de requête tenant (pas au bootstrap).
 * Les entités étendent TenantEntity → le tenant_id est injecté automatiquement
 * à l'insertion (@BeforeInsert), et les lectures sont filtrées par tenant.
 * Ainsi chaque cabinet obtient son propre plan comptable isolé.
 *
 * Idempotent : ne recrée que ce qui manque. Relançable sans risque.
 */
@Injectable()
export class InitialisationComptableService {
  private readonly logger = new Logger(InitialisationComptableService.name);

  constructor(
    @InjectRepository(CompteComptable)   private readonly compteRepo:   Repository<CompteComptable>,
    @InjectRepository(JournalComptable)  private readonly journalRepo:  Repository<JournalComptable>,
    @InjectRepository(ExerciceComptable) private readonly exerciceRepo: Repository<ExerciceComptable>,
  ) {}

  /**
   * Garantit que le tenant courant possède son plan comptable complet.
   * Retourne le nombre d'éléments créés.
   */
  async initialiser(): Promise<{ comptes: number; journaux: number; exercice: boolean }> {
    const comptes  = await this.seedComptes();
    const journaux = await this.seedJournaux();
    const exercice = await this.seedExerciceCourant();
    if (comptes || journaux || exercice) {
      this.logger.log(`Initialisation comptable : ${comptes} comptes, ${journaux} journaux, exercice ${exercice ? 'créé' : 'existant'}.`);
    }
    return { comptes, journaux, exercice };
  }

  /** Vérifie si le tenant courant a déjà un plan comptable. */
  async estInitialise(): Promise<boolean> {
    const nbJournaux = await this.journalRepo.count({ where: this.withTenant({}) });
    return nbJournaux > 0;
  }

  private async seedComptes(): Promise<number> {
    let created = 0;
    for (const data of COMPTES_SYSCOHADA) {
      const exists = await this.compteRepo.findOne({ where: this.withTenant({ numero: data.numero }) });
      if (!exists) {
        await this.compteRepo.save(this.compteRepo.create({ ...data, actif: true }));
        created++;
      }
    }
    return created;
  }

  private async seedJournaux(): Promise<number> {
    let created = 0;
    for (const data of JOURNAUX_SYSCOHADA) {
      const exists = await this.journalRepo.findOne({ where: this.withTenant({ code: data.code }) });
      if (!exists) {
        await this.journalRepo.save(this.journalRepo.create({ ...data, actif: true }));
        created++;
      }
    }
    return created;
  }

  private async seedExerciceCourant(): Promise<boolean> {
    const annee = new Date().getFullYear();
    const exists = await this.exerciceRepo.findOne({ where: this.withTenant({ annee }) });
    if (exists) return false;
    await this.exerciceRepo.save(this.exerciceRepo.create({
      annee,
      dateDebut: new Date(`${annee}-01-01`),
      dateFin:   new Date(`${annee}-12-31`),
      statut:    StatutExercice.OUVERT,
    }));
    return true;
  }

  private withTenant<T extends Record<string, any>>(where: T): T & { tenant_id?: number } {
    return hasActiveTenant() ? { ...where, tenant_id: getCurrentTenantId() } : where;
  }
}
