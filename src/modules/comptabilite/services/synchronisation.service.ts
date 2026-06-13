import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Facture } from 'src/modules/facture/entities/facture.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Paiement } from 'src/modules/paiement/entities/paiement.entity';
import { StatutPaiement } from 'src/modules/paiement/dto/create-paiement.dto';
import { SupplierInvoice, SupplierInvoiceStatus } from 'src/modules/supplier/entities/supplier-invoice.entity';
import { ExpenseReport, ExpenseReportStatus } from 'src/modules/supplier/entities/expense-report.entity';
import { Payslip, PayslipStatus } from 'src/modules/payroll/entities/payslip.entity';

import { ComptabilisationService } from './comptabilisation.service';
import { InitialisationComptableService } from './initialisation.service';

interface LigneSync { eligibles: number; crees: number; ignores: number; erreurs: number }

export interface RapportSync {
  factures:             LigneSync;
  paiements:            LigneSync;
  facturesFournisseurs: LigneSync;
  paiementsFournisseurs:LigneSync;
  notesDeFrais:         LigneSync;
  paie:                 LigneSync;
  total:                { crees: number; ignores: number; erreurs: number };
}

/**
 * Synchronisation initiale (backfill).
 *
 * Lorsqu'un cabinet active la comptabilité APRÈS avoir déjà créé des factures,
 * paiements, dépenses, etc., ce service rejoue tout l'historique pour générer
 * les écritures manquantes.
 *
 * - Lecture seule sur les modules métier (ne modifie jamais leurs données).
 * - Idempotent : ne recrée pas une écriture déjà présente (relançable à volonté).
 * - Scoping tenant automatique (les repositories sont filtrés par tenant_id).
 */
@Injectable()
export class SynchronisationService {
  private readonly logger = new Logger(SynchronisationService.name);

  constructor(
    @InjectRepository(Facture)         private readonly factureRepo:  Repository<Facture>,
    @InjectRepository(Paiement)        private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(SupplierInvoice) private readonly supplierRepo: Repository<SupplierInvoice>,
    @InjectRepository(ExpenseReport)   private readonly expenseRepo:  Repository<ExpenseReport>,
    @InjectRepository(Payslip)         private readonly payslipRepo:  Repository<Payslip>,
    private readonly comptabilisation: ComptabilisationService,
    private readonly initialisation:   InitialisationComptableService,
  ) {}

  // Statuts éligibles à la comptabilisation
  private static readonly FACTURE_STATUTS = [
    StatutFacture.ENVOYEE,
    StatutFacture.PARTIELLEMENT_PAYEE,
    StatutFacture.PAYEE,
    StatutFacture.IMPAYEE,
  ];

  /**
   * Aperçu : combien de documents sont éligibles (sans rien créer).
   * Sert à afficher « 142 factures, 87 paiements… à synchroniser » avant action.
   */
  async etat(): Promise<Record<string, number>> {
    const [factures, paiements, fApprouvees, fPayees, notes, paie] = await Promise.all([
      this.factureRepo.count({ where: { status: In(SynchronisationService.FACTURE_STATUTS) } }),
      this.paiementRepo.count({ where: { status: StatutPaiement.VALIDE } }),
      this.supplierRepo.count({ where: { status: In([SupplierInvoiceStatus.APPROVED, SupplierInvoiceStatus.PAID]) } }),
      this.supplierRepo.count({ where: { status: SupplierInvoiceStatus.PAID } }),
      this.expenseRepo.count({ where: { status: ExpenseReportStatus.REIMBURSED } }),
      this.payslipRepo.count({ where: { status: PayslipStatus.PAID } }),
    ]);
    return {
      factures,
      paiements,
      facturesFournisseurs: fApprouvees,
      paiementsFournisseurs: fPayees,
      notesDeFrais: notes,
      paie,
    };
  }

  /**
   * Lance le backfill complet. Idempotent.
   */
  async synchroniser(): Promise<RapportSync> {
    this.logger.log('Démarrage de la synchronisation comptable…');

    // Garantit que le plan comptable du tenant courant existe AVANT de
    // comptabiliser (plan SYSCOHADA + journaux + exercice). Indispensable
    // pour un tenant qui active le module : le seeding au bootstrap ne crée
    // le plan que pour le tenant par défaut.
    await this.initialisation.initialiser();

    const factures             = await this.syncFactures();
    const paiements            = await this.syncPaiements();
    const facturesFournisseurs = await this.syncFacturesFournisseurs();
    const paiementsFournisseurs= await this.syncPaiementsFournisseurs();
    const notesDeFrais         = await this.syncNotesDeFrais();
    const paie                 = await this.syncPaie();

    const groups = [factures, paiements, facturesFournisseurs, paiementsFournisseurs, notesDeFrais, paie];
    const total = {
      crees:   groups.reduce((s, g) => s + g.crees, 0),
      ignores: groups.reduce((s, g) => s + g.ignores, 0),
      erreurs: groups.reduce((s, g) => s + g.erreurs, 0),
    };

    this.logger.log(
      `Synchronisation terminée : ${total.crees} créées, ${total.ignores} déjà présentes, ${total.erreurs} en erreur.`,
    );
    return { factures, paiements, facturesFournisseurs, paiementsFournisseurs, notesDeFrais, paie, total };
  }

  /**
   * Exécute la comptabilisation d'une collection et compte précisément :
   *   - créée     : nouvelle écriture générée
   *   - ignorée   : déjà comptabilisée (idempotence) → retour null sans erreur
   *   - erreur    : exception levée pendant le traitement
   */
  private async traiter<T>(rows: T[], fn: (row: T) => Promise<any>): Promise<LigneSync> {
    let crees = 0, ignores = 0, erreurs = 0;
    for (const row of rows) {
      try {
        const r = await fn(row);
        r ? crees++ : ignores++;
      } catch (e) {
        erreurs++;
        this.logger.error(`Échec comptabilisation : ${(e as Error).message}`);
      }
    }
    return { eligibles: rows.length, crees, ignores, erreurs };
  }

  // ── Détails par type ───────────────────────────────────────────────────────

  private async syncFactures() {
    const rows = await this.factureRepo.find({
      where: { status: In(SynchronisationService.FACTURE_STATUTS) },
      relations: ['client'],
    });
    return this.traiter(rows, f => this.comptabilisation.comptabiliserFacture(f));
  }

  private async syncPaiements() {
    const rows = await this.paiementRepo.find({
      where: { status: StatutPaiement.VALIDE },
      relations: ['facture'],
    });
    return this.traiter(rows, p => this.comptabilisation.comptabiliserPaiement(p));
  }

  private async syncFacturesFournisseurs() {
    const rows = await this.supplierRepo.find({
      where: { status: In([SupplierInvoiceStatus.APPROVED, SupplierInvoiceStatus.PAID]) },
      relations: ['supplier'],
    });
    return this.traiter(rows, inv => this.comptabilisation.comptabiliserFactureFournisseur(inv));
  }

  private async syncPaiementsFournisseurs() {
    const rows = await this.supplierRepo.find({
      where: { status: SupplierInvoiceStatus.PAID },
      relations: ['supplier'],
    });
    return this.traiter(rows, inv => this.comptabilisation.comptabiliserPaiementFournisseur(inv));
  }

  private async syncNotesDeFrais() {
    const rows = await this.expenseRepo.find({
      where: { status: ExpenseReportStatus.REIMBURSED },
      relations: ['lines', 'employee'],
    });
    return this.traiter(rows, rep => this.comptabilisation.comptabiliserNoteDeFrais(rep));
  }

  private async syncPaie() {
    const rows = await this.payslipRepo.find({
      where: { status: PayslipStatus.PAID },
      relations: ['employee', 'period'],
    });
    return this.traiter(rows, ps => this.comptabilisation.comptabiliserPaie(ps));
  }
}
