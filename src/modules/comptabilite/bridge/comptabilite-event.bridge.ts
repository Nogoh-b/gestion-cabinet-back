import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StatutFacture } from '../../facture/dto/create-facture.dto';
import { ComptabilisationService } from '../services/comptabilisation.service';

/**
 * Pont durable : seuls les événements délivrés depuis l'outbox peuvent
 * déclencher une écriture comptable.
 *
 * Le bridge ne contient AUCUNE logique comptable — il ne fait que router.
 * La même logique est réutilisée par la synchronisation initiale (backfill).
 */
@Injectable()
export class ComptabiliteEventBridge {
  constructor(private readonly comptabilisation: ComptabilisationService) {}

  @OnEvent('outbox.invoice.validated', { async: true })
  async onInvoiceValidated(payload: any) {
    await this.comptabilisation.comptabiliserFacture({
      id: payload.invoiceId,
      dossier_id: payload.dossierId,
      client_id: payload.clientId,
      numero: payload.numero,
      dateFacture: payload.dateFacture,
      montantHT: payload.montantHT,
      montantTVA: payload.montantTVA,
      montantTTC: payload.montantTTC,
    });
  }

  @OnEvent('outbox.invoice.cancelled', { async: true })
  async onInvoiceCancelled(payload: any) {
    if (Number(payload.previousStatus) !== StatutFacture.VALIDEE) {
      return;
    }
    await this.comptabilisation.extournerFacture({
      id: payload.invoiceId,
      numero: payload.numero,
      montantHT: payload.montantHT,
      montantTVA: payload.montantTVA,
      montantTTC: payload.montantTTC,
    });
  }

  @OnEvent('outbox.invoice.credit_note.validated', { async: true })
  async onCreditNoteValidated(payload: any) {
    await this.comptabilisation.comptabiliserAvoir({
      id: payload.invoiceId,
      numero: payload.numero,
      dateFacture: payload.dateFacture,
      montantHT: payload.montantHT,
      montantTVA: payload.montantTVA,
      montantTTC: payload.montantTTC,
      originalInvoiceId: payload.originalInvoiceId,
      originalInvoiceNumber: payload.originalInvoiceNumber,
    });
  }

  @OnEvent('outbox.invoice.waived', { async: true })
  async onInvoiceWaived(payload: any) {
    await this.comptabilisation.comptabiliserAbandonCreance({
      ...payload,
      badDebt: false,
    });
  }

  @OnEvent('outbox.invoice.bad_debt', { async: true })
  async onInvoiceBadDebt(payload: any) {
    await this.comptabilisation.comptabiliserAbandonCreance({
      ...payload,
      badDebt: true,
    });
  }

  @OnEvent('outbox.payment.validated', { async: true })
  async onPaymentValidated(payload: any) {
    const paiement = {
      id: payload.paymentId,
      factureId: payload.invoiceId,
      montant: payload.amount,
      modePaiement: payload.modePaiement,
      datePaiement: payload.datePaiement,
      reference: payload.reference,
      facture: {
        id: payload.invoiceId,
        numero: payload.invoiceNumber,
      },
    };
    await this.comptabilisation.comptabiliserPaiement(paiement);
  }

  @OnEvent('outbox.supplier_invoice.approved', { async: true })
  async onSupplierInvoiceApproved(payload: any) {
    await this.comptabilisation.comptabiliserFactureFournisseur({
      id: payload.supplierInvoiceId,
      invoice_number: payload.invoiceNumber,
      invoice_date: payload.invoiceDate,
      description: payload.description,
      amount_ht: payload.amountHt,
      amount_tva: payload.amountTva,
      amount_ttc: payload.amountTtc,
      supplier: {
        company_name: payload.supplierName,
        category: payload.supplierCategory,
      },
    });
  }

  @OnEvent('outbox.supplier_invoice.paid', { async: true })
  async onSupplierInvoicePaid(payload: any) {
    await this.comptabilisation.comptabiliserPaiementFournisseur({
      id: payload.supplierInvoiceId,
      invoice_number: payload.invoiceNumber,
      payment_date: payload.paymentDate,
      amount_ttc: payload.amountTtc,
      supplier: {
        company_name: payload.supplierName,
      },
    });
  }

  @OnEvent('outbox.expense_report.reimbursed', { async: true })
  async onExpenseReportReimbursed(payload: any) {
    await this.comptabilisation.comptabiliserNoteDeFrais({
      id: payload.expenseReportId,
      title: payload.title,
      total_amount: payload.totalAmount,
      reimbursement_date: payload.reimbursementDate,
      lines: payload.lines,
      employee: {
        nom: payload.employeeName,
      },
    });
  }

  @OnEvent('outbox.payslip.paid', { async: true })
  async onPayslipPaid(payload: any) {
    const payslip = {
      id: payload.payslipId,
      employee_id: payload.employeeId,
      period_id: payload.periodId,
      gross_amount: payload.grossAmount,
      net_amount: payload.netAmount,
      total_employer_charges: payload.totalEmployerCharges,
      payment_date: payload.paymentDate,
      payment_method: payload.paymentMethod,
      payment_reference: payload.paymentReference,
      employee: { nom: payload.employeeName },
      period: { label: payload.periodLabel },
      lines: (payload.lines ?? []).map((line: any) => ({
        line_type: line.lineType,
        label: line.label,
        amount: line.amount,
      })),
    };
    await this.comptabilisation.comptabiliserPaie(payslip);
    await this.comptabilisation.comptabiliserPaiementPaie(payslip);
  }

  @OnEvent('outbox.salary_advance.paid', { async: true })
  async onSalaryAdvancePaid(payload: any) {
    await this.comptabilisation.comptabiliserAvanceSalaire({
      id: payload.salaryAdvanceId,
      employee_id: payload.employeeId,
      employee_name: payload.employeeName,
      amount: payload.amount,
      payment_date: payload.paymentDate,
      payment_method: payload.paymentMethod,
      payment_reference: payload.paymentReference,
    });
  }

  @OnEvent('outbox.referral_commission.paid', { async: true })
  async onReferralCommissionPaid(payload: any) {
    await this.comptabilisation.comptabiliserCommission({
      id: payload.commissionId,
      dossier_referral_id: payload.dossierReferralId,
      facture_id: payload.invoiceId,
      paiement_id: payload.sourcePaymentId,
      amount: payload.amount,
      payment_date: payload.paymentDate,
      payment_method: payload.paymentMethod,
      payment_reference: payload.paymentReference,
      referrer_name: payload.referrerName,
    });
  }
}
