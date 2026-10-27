import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import PDFDocument = require('pdfkit');
import { DataSource } from 'typeorm';
import { readBillingSetting } from './billing-settings';

const CYCLES: Record<string, string> = { monthly: 'mensuel', yearly: 'annuel' };

/** Texte compatible avec les polices PDF standard (WinAnsi). */
function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[  ]/g, ' ')
    .replace(/[→➔]/g, '->')
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”…€]/g, '');
}

export function formatAmount(value: number, currency: string): string {
  const decimals = ['XAF', 'XOF'].includes(currency) ? 0 : 2;
  const fixed = Number(value ?? 0).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped}${dec ? `,${dec}` : ''} ${currency === 'XAF' ? 'FCFA' : currency}`;
}

function frDate(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Reçus des paiements d'abonnement : numérotation annuelle sans trou
 * (compteur verrouillé en transaction) et génération du PDF à la demande.
 */
@Injectable()
export class ReceiptService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Attribue (une seule fois) le numéro de reçu d'un paiement encaissé. */
  async assignNumber(paymentId: number): Promise<string | null> {
    return this.db.transaction(async (m) => {
      const [payment] = await m.query(
        'SELECT id, receipt_number, paid_at, status FROM subscription_payments WHERE id = ? FOR UPDATE',
        [paymentId],
      );
      if (!payment || !['paid', 'refunded'].includes(payment.status)) return null;
      if (payment.receipt_number) return payment.receipt_number;
      const year = (payment.paid_at ? new Date(payment.paid_at) : new Date()).getFullYear();
      const key = `receipt_counter:${year}`;
      await m.query("INSERT IGNORE INTO platform_settings (`key`, value) VALUES (?, '0')", [key]);
      const [row] = await m.query(
        'SELECT value FROM platform_settings WHERE `key` = ? FOR UPDATE',
        [key],
      );
      const current = Number(typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value) || 0;
      const next = current + 1;
      await m.query('UPDATE platform_settings SET value = ? WHERE `key` = ?', [String(next), key]);
      const { prefix } = await readBillingSetting(m, 'receipts');
      const number = `${prefix || 'REC'}-${year}-${String(next).padStart(6, '0')}`;
      await m.query('UPDATE subscription_payments SET receipt_number = ? WHERE id = ?', [number, paymentId]);
      return number;
    });
  }

  /** PDF du reçu. `cabinetId` restreint l'accès au cabinet propriétaire. */
  async pdf(paymentId: number, cabinetId?: number): Promise<{ buffer: Buffer; filename: string }> {
    const [p] = await this.db.query(
      `SELECT sp.*, c.name AS cabinet_name, c.address AS cabinet_address, c.contact_email AS cabinet_email,
              c.contact_phone AS cabinet_phone, c.code AS cabinet_code,
              pl.name AS plan_name, s.billing_cycle, pm.label AS method_label, ap.name AS pack_name
         FROM subscription_payments sp
         JOIN cabinets c ON c.id = sp.cabinet_id
         LEFT JOIN ai_credit_packs ap ON ap.id = sp.ai_credit_pack_id
         LEFT JOIN subscriptions s ON s.id = sp.subscription_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
         LEFT JOIN platform_payment_methods pm ON pm.id = sp.payment_method_id
        WHERE sp.id = ? ${cabinetId ? 'AND sp.cabinet_id = ?' : ''}`,
      cabinetId ? [paymentId, cabinetId] : [paymentId],
    );
    if (!p) throw new NotFoundException('Paiement introuvable');
    if (!['paid', 'refunded'].includes(p.status)) {
      throw new BadRequestException('Le reçu est disponible une fois le paiement encaissé.');
    }
    const number = p.receipt_number ?? (await this.assignNumber(paymentId));
    const issuer = await readBillingSetting(this.db, 'issuer');
    const receipts = await readBillingSetting(this.db, 'receipts');
    const currency = p.currency || 'XAF';
    const amount = Number(p.amount);
    const gross = p.amount_gross !== null && p.amount_gross !== undefined ? Number(p.amount_gross) : amount;
    const discount = Number(p.discount_amount ?? 0);
    const refunded = Number(p.refund_amount ?? 0);

    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Reçu ${number}`, Author: issuer.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // En-tête émetteur
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(pdfText(issuer.name || 'KabySoft'), left, 50);
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    const issuerLines = [
      issuer.legal_name,
      issuer.address,
      [issuer.city, issuer.country].filter(Boolean).join(', '),
      [issuer.phone, issuer.email].filter(Boolean).join(' · '),
      issuer.website,
      [issuer.tax_id && `NIU ${issuer.tax_id}`, issuer.rccm && `RCCM ${issuer.rccm}`].filter(Boolean).join(' · '),
    ].filter(Boolean);
    for (const line of issuerLines) doc.text(pdfText(line));

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text('REÇU DE PAIEMENT', left, 50, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(pdfText(`N° ${number}`), left, 72, { width, align: 'right' });
    doc.text(pdfText(`Date d'encaissement : ${frDate(p.paid_at)}`), { width, align: 'right' });

    // Client
    let y = Math.max(doc.y, 150) + 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Reçu de', left, y);
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(pdfText(p.cabinet_name));
    if (p.cabinet_address) doc.text(pdfText(p.cabinet_address));
    if (p.cabinet_email) doc.text(pdfText(p.cabinet_email));
    doc.text(pdfText(`Code cabinet : ${p.cabinet_code}`));

    // Tableau
    y = doc.y + 24;
    const cols = [left, left + 260, right - 120];
    doc.rect(left, y, width, 22).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
    doc.text('Désignation', cols[0] + 8, y + 7);
    doc.text('Période', cols[1], y + 7);
    doc.text('Montant', cols[2], y + 7, { width: 112, align: 'right' });
    y += 30;
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    const isCredits = p.kind === 'ai_credits';
    const label = isCredits
      ? `Credits IA ${p.pack_name ?? ''}`.trim()
      : `Abonnement ${p.plan_name ?? ''}${p.billing_cycle ? ` (${CYCLES[p.billing_cycle] ?? p.billing_cycle})` : ''}`;
    doc.text(pdfText(label), cols[0] + 8, y, { width: 245 });
    doc.text(
      pdfText(isCredits ? `Achat du ${frDate(p.paid_at)}` : `${frDate(p.period_start)} au ${frDate(p.period_end)}`),
      cols[1],
      y,
      { width: 150 },
    );
    doc.text(pdfText(formatAmount(gross, currency)), cols[2], y, { width: 112, align: 'right' });
    y = Math.max(doc.y, y + 14) + 14;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e2e8f0').stroke();

    // Totaux
    y += 12;
    const totalLine = (text: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(bold ? '#0f172a' : '#334155');
      doc.text(pdfText(text), right - 260, y, { width: 140 });
      doc.text(pdfText(value), right - 120, y, { width: 120, align: 'right' });
      y += bold ? 20 : 16;
    };
    if (discount > 0) {
      totalLine('Sous-total', formatAmount(gross, currency));
      totalLine('Remise', `- ${formatAmount(discount, currency)}`);
    }
    totalLine('Total payé', formatAmount(amount, currency), true);
    if (refunded > 0) {
      totalLine(`Remboursé le ${frDate(p.refunded_at)}`, `- ${formatAmount(refunded, currency)}`);
    }

    // Règlement
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Règlement', left, y);
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(pdfText(`Moyen : ${p.method_label ?? p.provider ?? p.method ?? '—'}`));
    const reference = p.declared_reference ?? p.reference;
    if (reference) doc.text(pdfText(`Référence : ${reference}`));
    doc.text(pdfText(`Statut : ${p.status === 'refunded' ? 'remboursé' : 'payé'}`));

    // Pied de page
    const footerY = doc.page.height - 90;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor('#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    if (receipts.footer_note) doc.text(pdfText(receipts.footer_note), left, footerY + 10, { width, align: 'center' });
    doc.text('Document généré électroniquement — valable sans signature.', left, doc.y + 2, { width, align: 'center' });

    doc.end();
    return { buffer: await done, filename: `recu-${number}.pdf` };
  }
}
