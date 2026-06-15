import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ComptabilisationService } from '../services/comptabilisation.service';

/**
 * Pont événementiel : écoute les événements métier émis par les modules
 * existants (facture, paiement, fournisseur, RH) et délègue la création de
 * l'écriture comptable au ComptabilisationService.
 *
 * Le bridge ne contient AUCUNE logique comptable — il ne fait que router.
 * La même logique est réutilisée par la synchronisation initiale (backfill).
 */
@Injectable()
export class ComptabiliteEventBridge {
  private readonly logger = new Logger(ComptabiliteEventBridge.name);

  constructor(private readonly comptabilisation: ComptabilisationService) {}

  @OnEvent('facture.envoyee', { async: true })
  async onFactureEnvoyee(facture: any) {
    try { await this.comptabilisation.comptabiliserFacture(facture); }
    catch (e) { this.logger.error(`[facture.envoyee] ${e.message}`); }
  }

  @OnEvent('facture.annulee', { async: true })
  async onFactureAnnulee(facture: any) {
    try { await this.comptabilisation.extournerFacture(facture); }
    catch (e) { this.logger.error(`[facture.annulee] ${e.message}`); }
  }

  @OnEvent('paiement.valide', { async: true })
  async onPaiementValide(paiement: any) {
    try { await this.comptabilisation.comptabiliserPaiement(paiement); }
    catch (e) { this.logger.error(`[paiement.valide] ${e.message}`); }
  }

  @OnEvent('supplier_invoice.approuvee', { async: true })
  async onSupplierInvoiceApprouvee(invoice: any) {
    try { await this.comptabilisation.comptabiliserFactureFournisseur(invoice); }
    catch (e) { this.logger.error(`[supplier_invoice.approuvee] ${e.message}`); }
  }

  @OnEvent('supplier_invoice.payee', { async: true })
  async onSupplierInvoicePayee(invoice: any) {
    try { await this.comptabilisation.comptabiliserPaiementFournisseur(invoice); }
    catch (e) { this.logger.error(`[supplier_invoice.payee] ${e.message}`); }
  }

  @OnEvent('expense_report.remboursee', { async: true })
  async onExpenseReportRemboursee(report: any) {
    try { await this.comptabilisation.comptabiliserNoteDeFrais(report); }
    catch (e) { this.logger.error(`[expense_report.remboursee] ${e.message}`); }
  }

  @OnEvent('payslip.payee', { async: true })
  async onPayslipPayee(payslip: any) {
    try { await this.comptabilisation.comptabiliserPaie(payslip); }
    catch (e) { this.logger.error(`[payslip.payee] ${e.message}`); }
  }

  @OnEvent('salary_advance.payee', { async: true })
  async onSalaryAdvancePayee(advance: any) {
    try { await this.comptabilisation.comptabiliserAvanceSalaire(advance); }
    catch (e) { this.logger.error(`[salary_advance.payee] ${e.message}`); }
  }

  @OnEvent('referral_commission.payee', { async: true })
  async onReferralCommissionPayee(commission: any) {
    try { await this.comptabilisation.comptabiliserCommission(commission); }
    catch (e) { this.logger.error(`[referral_commission.payee] ${e.message}`); }
  }
}
