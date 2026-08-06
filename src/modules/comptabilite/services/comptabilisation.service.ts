import { Injectable, Logger } from '@nestjs/common';
import { EcrituresService } from './ecritures.service';
import { Ecriture } from '../entities/ecriture.entity';
import { SourceModule, TypeJournal } from '../enums/comptabilite.enums';

/**
 * Cœur métier de la comptabilisation.
 *
 * Contient TOUTE la logique de transformation d'un document métier
 * (facture, paiement, dépense…) en écriture comptable.
 *
 * Utilisé par DEUX appelants :
 *   1. ComptabiliteEventBridge  → en temps réel (sur événement)
 *   2. SynchronisationService   → en rattrapage (backfill de l'historique)
 *
 * Chaque méthode est IDEMPOTENTE : si l'écriture existe déjà pour ce
 * document source (même module + même id + même journal), elle est ignorée
 * et retourne `null`. On peut donc relancer une synchronisation sans risque
 * de doublon.
 */

const COMPTE_CHARGE_FOURNISSEUR: Record<string, string> = {
  RENT: '622', INTERNET: '626', ELECTRICITY: '605',
  SUPPLIES: '601', SOFTWARE: '626', INSURANCE: '616',
  MAINTENANCE: '615', BAILIFF: '622', OTHER: '628',
};

const COMPTE_CHARGE_NOTE_FRAIS: Record<string, string> = {
  TRANSPORT: '625', ACCOMMODATION: '625', MEAL: '625',
  BAILIFF: '622', COURT_FEES: '622', OFFICE_SUPPLIES: '601', OTHER: '628',
};

@Injectable()
export class ComptabilisationService {
  private readonly logger = new Logger(ComptabilisationService.name);

  constructor(private readonly ecritures: EcrituresService) {}

  // ── Factures clients ─────────────────────────────────────────────────────────

  async comptabiliserFacture(facture: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.FACTURE, facture.id, TypeJournal.VENTES)) return null;
    // TTC ancré sur HT + TVA (définition d'une facture). On ne fait pas confiance
    // au champ montantTTC stocké, qui peut être faux/écrêté (decimal 10,2).
    // → l'écriture est équilibrée par construction.
    const ht  = Number(facture.montantHT)  || 0;
    const tva = Number(facture.montantTVA) || 0;
    const ttc = ht + tva;
    return this.ecritures.creer({
      dateEcriture: facture.dateFacture,
      libelle:      `Facture ${facture.numero} — ${facture.client?.nom ?? facture.client?.name ?? ''}`.trim(),
      codeJournal:  TypeJournal.VENTES,
      sourceModule: SourceModule.FACTURE,
      sourceId:     String(facture.id),
      lignes: [
        { numeroCompte: '411', debit: ttc, credit: 0,   libelle: `Client — ${facture.numero}` },
        { numeroCompte: '706', debit: 0,   credit: ht,  libelle: `Honoraires — ${facture.numero}` },
        { numeroCompte: '445', debit: 0,   credit: tva, libelle: `TVA collectée — ${facture.numero}` },
      ],
    }, true);
  }

  async extournerFacture(facture: any): Promise<Ecriture | null> {
    const ht  = Number(facture.montantHT)  || 0;
    const tva = Number(facture.montantTVA) || 0;
    const ttc = ht + tva;
    return this.ecritures.creer({
      dateEcriture: new Date().toISOString(),
      libelle:      `Annulation facture ${facture.numero}`,
      codeJournal:  TypeJournal.VENTES,
      sourceModule: SourceModule.FACTURE,
      sourceId:     `reversal:${facture.id}`,
      idempotencyKey: `invoice-reversal:${facture.id}`,
      lignes: [
        { numeroCompte: '411', debit: 0,   credit: ttc, libelle: `Extourne client — ${facture.numero}` },
        { numeroCompte: '706', debit: ht,  credit: 0,   libelle: `Extourne honoraires — ${facture.numero}` },
        { numeroCompte: '445', debit: tva, credit: 0,   libelle: `Extourne TVA — ${facture.numero}` },
      ],
    }, true);
  }

  // ── Paiements clients ────────────────────────────────────────────────────────

  async comptabiliserPaiement(paiement: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.PAIEMENT, paiement.id, TypeJournal.BANQUE)) return null;
    const compteTresorerie = paiement.modePaiement === 2 || paiement.modePaiement === 'ESPECES' ? '571' : '512';
    return this.ecritures.creer({
      dateEcriture: paiement.datePaiement ?? new Date().toISOString(),
      libelle:      `Règlement — ${paiement.facture?.numero ?? paiement.factureId}`,
      codeJournal:  TypeJournal.BANQUE,
      sourceModule: SourceModule.PAIEMENT,
      sourceId:     String(paiement.id),
      lignes: [
        { numeroCompte: compteTresorerie, debit: Number(paiement.montant), credit: 0,                        libelle: `Encaissement — ${paiement.reference ?? ''}` },
        { numeroCompte: '411',            debit: 0,                        credit: Number(paiement.montant), libelle: `Solde client — ${paiement.facture?.numero ?? ''}` },
      ],
    }, true);
  }

  // ── Factures fournisseurs ────────────────────────────────────────────────────

  async comptabiliserFactureFournisseur(invoice: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.SUPPLIER_INVOICE, invoice.id, TypeJournal.ACHATS)) return null;
    const compteCharge = COMPTE_CHARGE_FOURNISSEUR[invoice.supplier?.category] ?? '628';
    // TTC ancré sur HT + TVA → équilibre garanti.
    const ht  = Number(invoice.amount_ht)  || 0;
    const tva = Number(invoice.amount_tva) || 0;
    const ttc = ht + tva;
    const lignes: any[] = [
      { numeroCompte: compteCharge, debit: ht, credit: 0, libelle: invoice.description ?? invoice.invoice_number },
    ];
    if (tva > 0) {
      lignes.push({ numeroCompte: '445_ded', debit: tva, credit: 0, libelle: 'TVA déductible' });
    }
    lignes.push({ numeroCompte: '401', debit: 0, credit: ttc, libelle: `Fournisseur — ${invoice.supplier?.company_name}` });
    return this.ecritures.creer({
      dateEcriture: invoice.invoice_date,
      libelle:      `Facture fourn. ${invoice.invoice_number} — ${invoice.supplier?.company_name}`,
      codeJournal:  TypeJournal.ACHATS,
      sourceModule: SourceModule.SUPPLIER_INVOICE,
      sourceId:     String(invoice.id),
      lignes,
    }, true);
  }

  async comptabiliserPaiementFournisseur(invoice: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.SUPPLIER_INVOICE, invoice.id, TypeJournal.BANQUE)) return null;
    return this.ecritures.creer({
      dateEcriture: invoice.payment_date ?? new Date().toISOString(),
      libelle:      `Paiement fourn. ${invoice.invoice_number}`,
      codeJournal:  TypeJournal.BANQUE,
      sourceModule: SourceModule.SUPPLIER_INVOICE,
      sourceId:     String(invoice.id),
      lignes: [
        { numeroCompte: '401', debit: Number(invoice.amount_ttc), credit: 0,                          libelle: `Apurement — ${invoice.supplier?.company_name}` },
        { numeroCompte: '512', debit: 0,                          credit: Number(invoice.amount_ttc), libelle: 'Virement sortant' },
      ],
    }, true);
  }

  // ── Notes de frais ───────────────────────────────────────────────────────────

  async comptabiliserNoteDeFrais(report: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.EXPENSE_REPORT, report.id, TypeJournal.OD)) return null;
    const lignes = (report.lines ?? []).map((line: any) => ({
      numeroCompte: COMPTE_CHARGE_NOTE_FRAIS[line.category] ?? '628',
      debit:  Number(line.amount_ttc) || 0,
      credit: 0,
      libelle: line.description,
    }));
    // Crédit 421 ancré sur la somme réelle des lignes (pas total_amount stocké)
    // → équilibre garanti. Fallback sur total_amount si aucune ligne détaillée.
    const totalLignes = lignes.reduce((s: number, l: any) => s + l.debit, 0);
    const credit421 = totalLignes > 0 ? totalLignes : (Number(report.total_amount) || 0);
    if (lignes.length === 0) {
      lignes.push({ numeroCompte: '628', debit: credit421, credit: 0, libelle: report.title });
    }
    lignes.push({
      numeroCompte: '421',
      debit:  0,
      credit: credit421,
      libelle: `Remboursement — ${report.employee?.nom ?? ''}`,
    });
    return this.ecritures.creer({
      dateEcriture: report.reimbursement_date ?? new Date().toISOString(),
      libelle:      `Note de frais — ${report.title}`,
      codeJournal:  TypeJournal.OD,
      sourceModule: SourceModule.EXPENSE_REPORT,
      sourceId:     String(report.id),
      lignes,
    }, true);
  }

  // ── Paie ─────────────────────────────────────────────────────────────────────

  async comptabiliserPaie(payslip: any): Promise<Ecriture | null> {
    if (await this.existe(SourceModule.PAYSLIP, payslip.id, TypeJournal.OD)) return null;
    const round = (n: number) => Math.round(n * 100) / 100;
    const gross = Number(payslip.gross_amount);
    const net = Number(payslip.net_amount);

    // Récupération d'avance : retenue qui SOLDE le 425 (≠ cotisations sociales).
    // On l'isole du reste des retenues pour ne pas la confondre avec le 431.
    const recovery = round(
      (payslip.lines ?? [])
        .filter((l: any) => l.line_type === 'advance_recovery')
        .reduce((s: number, l: any) => s + Math.abs(Number(l.amount) || 0), 0),
    );
    const cotisationsSalariales = round(gross - net - recovery);
    const chargesPatronales = Number(payslip.total_employer_charges ?? 0);

    const lignes: any[] = [
      { numeroCompte: '641', debit: gross, credit: 0,   libelle: 'Rémunération brute' },
      { numeroCompte: '421', debit: 0,     credit: net, libelle: 'Personnel — net à payer' },
    ];
    if (cotisationsSalariales > 0) {
      lignes.push({ numeroCompte: '431', debit: 0, credit: cotisationsSalariales, libelle: 'Cotisations sociales (part salariale)' });
    }
    // Solde de l'avance précédemment versée (créance 425 apurée par la retenue).
    if (recovery > 0) {
      lignes.push({ numeroCompte: '425', debit: 0, credit: recovery, libelle: 'Récupération avance sur salaire' });
    }

    // Charges patronales : charge supplémentaire pour l'employeur, équilibrée au crédit du 431.
    if (chargesPatronales > 0) {
      lignes.push({ numeroCompte: '645', debit: chargesPatronales, credit: 0,                 libelle: 'Charges sociales patronales' });
      lignes.push({ numeroCompte: '431', debit: 0,                 credit: chargesPatronales, libelle: 'Cotisations sociales (part patronale)' });
    }

    return this.ecritures.creer({
      dateEcriture: payslip.payment_date ?? new Date().toISOString(),
      libelle:      `Paie ${payslip.period?.label ?? ''} — ${payslip.employee?.nom ?? ''}`,
      codeJournal:  TypeJournal.OD,
      sourceModule: SourceModule.PAYSLIP,
      sourceId:     String(payslip.id),
      lignes,
    }, true);
  }

  async comptabiliserAvoir(credit: any): Promise<Ecriture | null> {
    const sourceId = `credit-note:${credit.id}`;
    if (
      await this.existe(
        SourceModule.FACTURE,
        sourceId,
        TypeJournal.VENTES,
      )
    ) {
      return null;
    }
    const ht = Number(credit.montantHT) || 0;
    const tva = Number(credit.montantTVA) || 0;
    const ttc = ht + tva;
    return this.ecritures.creer(
      {
        dateEcriture: credit.dateFacture,
        libelle:
          `Avoir ${credit.numero} sur facture ` +
          `${credit.originalInvoiceNumber ?? credit.originalInvoiceId}`,
        codeJournal: TypeJournal.VENTES,
        sourceModule: SourceModule.FACTURE,
        sourceId,
        idempotencyKey: `credit-note:${credit.id}`,
        lignes: [
          {
            numeroCompte: '706',
            debit: ht,
            credit: 0,
            libelle: `Réduction honoraires — ${credit.numero}`,
          },
          {
            numeroCompte: '445',
            debit: tva,
            credit: 0,
            libelle: `Réduction TVA — ${credit.numero}`,
          },
          {
            numeroCompte: '411',
            debit: 0,
            credit: ttc,
            libelle: `Avoir client — ${credit.numero}`,
          },
        ],
      },
      true,
    );
  }

  /**
   * Solde la seule créance restante. Le traitement fiscal d'une créance
   * irrécouvrable dépendant du justificatif et de la juridiction, l'événement
   * conserve la qualification choisie et utilise une charge exceptionnelle
   * distincte de l'abandon commercial.
   */
  async comptabiliserAbandonCreance(invoice: any): Promise<Ecriture | null> {
    const remaining = Math.round(Number(invoice.remainingAmount) * 100) / 100;
    if (!Number.isFinite(remaining) || remaining <= 0) return null;
    const sourceId = invoice.badDebt
      ? `bad-debt:${invoice.invoiceId}`
      : `waiver:${invoice.invoiceId}`;
    if (
      await this.existe(
        SourceModule.FACTURE,
        sourceId,
        TypeJournal.VENTES,
      )
    ) {
      return null;
    }
    const lines = invoice.badDebt
      ? [
          {
            numeroCompte: '671',
            debit: remaining,
            credit: 0,
            libelle: `Créance irrécouvrable — ${invoice.numero}`,
          },
          {
            numeroCompte: '411',
            debit: 0,
            credit: remaining,
            libelle: `Apurement client — ${invoice.numero}`,
          },
        ]
      : this.waiverLines(invoice, remaining);
    return this.ecritures.creer(
      {
        dateEcriture: new Date().toISOString(),
        libelle: invoice.badDebt
          ? `Créance irrécouvrable — ${invoice.numero}`
          : `Abandon de créance — ${invoice.numero}`,
        codeJournal: TypeJournal.VENTES,
        sourceModule: SourceModule.FACTURE,
        sourceId,
        idempotencyKey: sourceId,
        lignes: lines,
      },
      true,
    );
  }

  private waiverLines(invoice: any, remaining: number): any[] {
    const total = Number(invoice.montantTTC);
    const ht = Number(invoice.montantHT);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(ht)) {
      return [
        {
          numeroCompte: '706',
          debit: remaining,
          credit: 0,
          libelle: `Abandon commercial — ${invoice.numero}`,
        },
        {
          numeroCompte: '411',
          debit: 0,
          credit: remaining,
          libelle: `Apurement client — ${invoice.numero}`,
        },
      ];
    }
    const htReduction = Math.round((remaining * ht * 100) / total) / 100;
    const vatReduction = Math.round((remaining - htReduction) * 100) / 100;
    const lines: any[] = [
      {
        numeroCompte: '706',
        debit: htReduction,
        credit: 0,
        libelle: `Abandon honoraires — ${invoice.numero}`,
      },
    ];
    if (vatReduction > 0) {
      lines.push({
        numeroCompte: '445',
        debit: vatReduction,
        credit: 0,
        libelle: `Régularisation TVA — ${invoice.numero}`,
      });
    }
    lines.push({
      numeroCompte: '411',
      debit: 0,
      credit: remaining,
      libelle: `Apurement client — ${invoice.numero}`,
    });
    return lines;
  }

  /**
   * Règlement effectif du net salarial, séparé de la constatation de la paie.
   * Cette écriture solde le compte 421 contre la banque ou la caisse.
   */
  async comptabiliserPaiementPaie(
    payslip: any,
  ): Promise<Ecriture | null> {
    const cash = payslip.payment_method === 'cash';
    const journal = cash ? TypeJournal.CAISSE : TypeJournal.BANQUE;
    if (
      await this.existe(SourceModule.PAYSLIP, payslip.id, journal)
    ) {
      return null;
    }
    const net = Math.round(Number(payslip.net_amount) * 100) / 100;
    if (!Number.isFinite(net) || net <= 0) return null;
    const treasuryAccount = cash ? '571' : '512';
    const employee = payslip.employee?.nom ?? '';
    return this.ecritures.creer(
      {
        dateEcriture:
          payslip.payment_date ?? new Date().toISOString(),
        libelle: `Règlement paie — ${employee}`.trim(),
        codeJournal: journal,
        sourceModule: SourceModule.PAYSLIP,
        sourceId: String(payslip.id),
        lignes: [
          {
            numeroCompte: '421',
            debit: net,
            credit: 0,
            libelle: `Net salarial — ${employee}`.trim(),
          },
          {
            numeroCompte: treasuryAccount,
            debit: 0,
            credit: net,
            libelle: payslip.payment_reference
              ? `Règlement ${payslip.payment_reference}`
              : 'Règlement salaire',
          },
        ],
      },
      true,
    );
  }

  // ── Commissions apporteurs d'affaires ─────────────────────────────────────────

  /**
   * Commission d'apporteur payée. Charge imputée au 632 « Rémunérations
   * d'intermédiaires (apporteurs) », contrepartie au 512 « Banque ». Journal
   * BANQUE. Le compte 632 est auto-créé pour les plans existants par
   * EcrituresService.creer (auto-réparation du plan comptable).
   */
  async comptabiliserCommission(commission: any): Promise<Ecriture | null> {
    const cash = commission.payment_method === 'cash';
    const journal = cash ? TypeJournal.CAISSE : TypeJournal.BANQUE;
    if (await this.existe(SourceModule.REFERRAL_COMMISSION, commission.id, journal)) return null;
    const montant = Number(commission.amount) || 0;
    if (montant <= 0) return null;
    const apporteur =
      commission.dossier_referral?.referrer?.company_name ??
      commission.referrer_name ??
      '';
    return this.ecritures.creer({
      dateEcriture: commission.payment_date ?? new Date().toISOString(),
      libelle:      `Commission apporteur — ${apporteur}`.trim(),
      codeJournal:  journal,
      sourceModule: SourceModule.REFERRAL_COMMISSION,
      sourceId:     String(commission.id),
      lignes: [
        { numeroCompte: '632', debit: montant, credit: 0,       libelle: `Commission apporteur — ${apporteur}`.trim() },
        {
          numeroCompte: cash ? '571' : '512',
          debit: 0,
          credit: montant,
          libelle: commission.payment_reference
            ? `Règlement ${commission.payment_reference}`
            : 'Règlement commission apporteur',
        },
      ],
    }, true);
  }

  // ── Avances sur salaire ────────────────────────────────────────────────────────

  /**
   * Avance sur salaire versée (entité SalaryAdvance, découplée du bulletin).
   * Débit 425 « Personnel — avances et acomptes » (créance sur le salarié,
   * soldée à la paie suivante), crédit 512 « Banque ». Journal BANQUE. Source
   * dédiée SALARY_ADVANCE → pas de collision d'idempotence avec la paie. Le
   * compte 425 est auto-créé pour les plans existants par EcrituresService.creer.
   */
  async comptabiliserAvanceSalaire(advance: any): Promise<Ecriture | null> {
    const cash = advance.payment_method === 'cash';
    const journal = cash ? TypeJournal.CAISSE : TypeJournal.BANQUE;
    if (await this.existe(SourceModule.SALARY_ADVANCE, advance.id, journal)) return null;
    const montant = Number(advance.amount) || 0;
    if (montant <= 0) return null;
    const salarie =
      advance.employee?.full_name ?? advance.employee?.nom ?? advance.employee_name ?? '';
    return this.ecritures.creer({
      dateEcriture: advance.payment_date ?? advance.date_granted ?? new Date().toISOString(),
      libelle:      `Avance sur salaire — ${salarie}`.trim(),
      codeJournal:  journal,
      sourceModule: SourceModule.SALARY_ADVANCE,
      sourceId:     String(advance.id),
      lignes: [
        { numeroCompte: '425', debit: montant, credit: 0,       libelle: `Avance — ${salarie}`.trim() },
        {
          numeroCompte: cash ? '571' : '512',
          debit: 0,
          credit: montant,
          libelle: advance.payment_reference
            ? `Versement ${advance.payment_reference}`
            : 'Versement avance sur salaire',
        },
      ],
    }, true);
  }

  // ── Idempotence ──────────────────────────────────────────────────────────────

  private async existe(module: SourceModule, sourceId: string | number, journal: TypeJournal): Promise<boolean> {
    return this.ecritures.existeParSource(module, String(sourceId), journal);
  }
}
