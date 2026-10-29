import PDFDocument = require('pdfkit');

import { formatAmount } from '../subscriptions/billing/receipt.service';
import { TypeFacture } from '../facture/dto/create-facture.dto';
import { invoiceStatusLabel } from '../facture/invoice-totals';

/**
 * PDF serveur d'une facture pour l'export hors-ligne (`factures/<numero>.pdf`).
 * Mise en page reprise de `front/configs/templatesPdf/InvoicePDF.tsx` : en-tête
 * cabinet, client, dossier, lignes, récapitulatif, puis l'historique des
 * paiements et le reste à payer. Les montants payé / restant viennent de
 * `summarizeInvoices` (paiements VALIDÉS seulement) : le PDF dit la même chose
 * que la fiche dossier et le résumé de l'export.
 */

export interface InvoicePdfCabinet {
  name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  /** Logo PNG ou JPEG (les autres formats sont ignorés). */
  logo?: Buffer | null;
}

export interface InvoicePdfLine {
  label?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate?: number | string | null;
  gross_amount?: number | string | null;
}

export interface InvoicePdfPayment {
  date?: Date | string | null;
  mode?: string | null;
  reference?: string | null;
  status?: string | null;
  amount?: number | string | null;
  /** false : paiement listé mais hors du total payé (en attente, rejeté…). */
  validated: boolean;
}

export interface InvoicePdfData {
  cabinet: InvoicePdfCabinet;
  invoice: {
    numero?: string | null;
    type?: number | string | null;
    status?: number | string | null;
    dateFacture?: Date | string | null;
    dateEcheance?: Date | string | null;
    libelle?: string | null;
    currency?: string | null;
    montantHT?: number | string | null;
    tauxTVA?: number | string | null;
    montantTVA?: number | string | null;
    montantTTC?: number | string | null;
    /** Numéro de la facture d'origine d'un avoir. */
    originalNumero?: string | null;
  };
  client?: {
    full_name?: string | null;
    company_name?: string | null;
    address?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    customer_code?: string | null;
  } | null;
  dossier?: {
    dossier_number?: string | null;
    object?: string | null;
    opening_date?: Date | string | null;
    lawyer?: string | null;
  } | null;
  lines: InvoicePdfLine[];
  payments: InvoicePdfPayment[];
  paid: number;
  remaining: number;
  cancelled?: boolean;
  generatedAt?: Date;
}

/** Texte compatible avec les polices PDF standard (WinAnsi). */
export function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[→➔]/g, '->')
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”…€]/g, '');
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function frDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as any);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function imageFormat(buffer?: Buffer | null): boolean {
  if (!buffer || buffer.length < 4) return false;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  return png || jpeg;
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { invoice, cabinet } = data;
  const currency = invoice.currency || 'XAF';
  const money = (v: unknown) => formatAmount(num(v), currency);
  const credit = Number(invoice.type) === TypeFacture.AVOIR;
  const title = credit ? 'AVOIR' : 'FACTURE';

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true, // pied de page « page i/n » écrit à la fin
    info: {
      Title: pdfText(`${title} ${invoice.numero ?? ''}`.trim()),
      Author: pdfText(cabinet.name ?? ''),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;
  const bottom = () => doc.page.height - 80;
  let y = 50;
  /** Nouvelle page si `height` ne tient plus avant le pied de page. */
  const ensure = (height: number) => {
    if (y + height <= bottom()) return;
    doc.addPage();
    y = 50;
  };

  // ── En-tête : cabinet à gauche, titre à droite ──
  let textLeft = left;
  if (imageFormat(cabinet.logo)) {
    try {
      doc.image(cabinet.logo!, left, y, { fit: [60, 60] });
      textLeft = left + 70;
    } catch {
      /* logo illisible : on s'en passe */
    }
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f172a');
  doc.text(pdfText(cabinet.name || 'Cabinet'), textLeft, y, { width: 280 });
  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  for (const line of [
    cabinet.address,
    [cabinet.phone, cabinet.email].filter(Boolean).join(' · '),
    cabinet.website,
  ].filter(Boolean)) {
    doc.text(pdfText(line), { width: 280 });
  }
  const headerBottom = Math.max(doc.y, y + 60);

  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a');
  doc.text(title, left, y, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#334155');
  doc.text(pdfText(`N° ${invoice.numero || '—'}`), { width, align: 'right' });
  const status = data.cancelled ? 'Annulée' : invoiceStatusLabel(invoice.status);
  doc.font('Helvetica-Bold').fillColor(data.cancelled ? '#dc2626' : '#2563eb');
  doc.text(pdfText(status), { width, align: 'right' });
  if (credit && invoice.originalNumero) {
    doc.font('Helvetica').fillColor('#334155');
    doc.text(pdfText(`Avoir sur la facture ${invoice.originalNumero}`), { width, align: 'right' });
  }
  y = Math.max(headerBottom, doc.y) + 20;

  // ── Client et détails ──
  const colWidth = width / 2 - 10;
  const client = data.client ?? {};
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
  doc.text('CLIENT', left, y);
  doc.text('DÉTAILS FACTURE', left + width / 2, y);
  const blockTop = y + 15;
  doc.font('Helvetica').fontSize(9).fillColor('#334155');
  doc.text('', left, blockTop);
  for (const line of [
    client.full_name || client.company_name || '—',
    client.full_name && client.company_name ? client.company_name : null,
    client.address,
    client.country,
    client.phone && `Tél : ${client.phone}`,
    client.email && `Email : ${client.email}`,
    client.customer_code && `Code client : ${client.customer_code}`,
  ].filter(Boolean)) {
    doc.text(pdfText(line), left, doc.y, { width: colWidth });
  }
  const clientBottom = doc.y;
  doc.text('', left + width / 2, blockTop);
  for (const line of [
    `Date d'émission : ${frDate(invoice.dateFacture)}`,
    `Date d'échéance : ${frDate(invoice.dateEcheance)}`,
    invoice.libelle && `Libellé : ${invoice.libelle}`,
    `Devise : ${currency}`,
  ].filter(Boolean)) {
    doc.text(pdfText(line), left + width / 2, doc.y, { width: colWidth });
  }
  y = Math.max(clientBottom, doc.y) + 18;

  // ── Dossier concerné ──
  if (data.dossier) {
    const d = data.dossier;
    const rows = [
      `N° dossier : ${d.dossier_number || '—'}`,
      `Objet : ${d.object || 'Non spécifié'}`,
      `Date d'ouverture : ${frDate(d.opening_date)}`,
      d.lawyer ? `Avocat référent : ${d.lawyer}` : null,
    ].filter(Boolean) as string[];
    const boxHeight = 22 + rows.length * 12;
    ensure(boxHeight);
    doc.rect(left, y, width, boxHeight).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text('DOSSIER CONCERNÉ', left + 10, y + 8);
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    rows.forEach((row, i) =>
      doc.text(pdfText(row), left + 10, y + 22 + i * 12, { width: width - 20 }),
    );
    y += boxHeight + 18;
  }

  // ── Lignes facturées ──
  const cols = {
    label: left + 6,
    qty: left + 250,
    unit: left + 295,
    tax: left + 385,
    gross: right - 106,
  };
  const tableHeader = (heads: [string, number, number, ('left' | 'right')?][]) => {
    ensure(40);
    doc.rect(left, y, width, 20).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a');
    for (const [text, x, w, align] of heads) {
      doc.text(text, x, y + 6, { width: w, align: align ?? 'left' });
    }
    y += 26;
  };
  const separator = () => {
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#e2e8f0').stroke();
    y += 6;
  };

  if (data.lines.length) {
    ensure(40);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text('DÉTAIL DES PRESTATIONS FACTURÉES', left, y);
    y += 16;
    tableHeader([
      ['Prestation', cols.label, 240],
      ['Qté', cols.qty, 40, 'right'],
      ['PU HT', cols.unit, 85, 'right'],
      ['TVA', cols.tax, 40, 'right'],
      ['Montant TTC', cols.gross, 100, 'right'],
    ]);
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    for (const line of data.lines) {
      const label = pdfText(
        `${line.label || '—'}${line.category ? ` — ${line.category}` : ''}`,
      );
      const height = Math.max(doc.heightOfString(label, { width: 240 }), 11);
      ensure(height + 8);
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(label, cols.label, y, { width: 240 });
      doc.text(String(num(line.quantity || 1)), cols.qty, y, { width: 40, align: 'right' });
      doc.text(pdfText(money(line.unit_price)), cols.unit, y, { width: 85, align: 'right' });
      doc.text(`${num(line.tax_rate)}%`, cols.tax, y, { width: 40, align: 'right' });
      doc.text(pdfText(money(line.gross_amount)), cols.gross, y, { width: 100, align: 'right' });
      y += height + 4;
      separator();
    }
    y += 8;
  }

  // ── Récapitulatif ──
  const totalLine = (label: string, value: string, opts: { bold?: boolean; color?: string } = {}) => {
    ensure(20);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 10);
    doc.fillColor(opts.color ?? (opts.bold ? '#0f172a' : '#334155'));
    doc.text(pdfText(label), right - 280, y, { width: 160 });
    doc.text(pdfText(value), right - 120, y, { width: 120, align: 'right' });
    y += opts.bold ? 20 : 16;
  };
  ensure(80);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
  doc.text('RÉCAPITULATIF', left, y);
  y += 18;
  totalLine('Montant HT', money(invoice.montantHT));
  totalLine(`TVA (${num(invoice.tauxTVA)}%)`, money(invoice.montantTVA));
  totalLine('TOTAL TTC', money(invoice.montantTTC), { bold: true });
  y += 10;

  // ── Paiements ──
  ensure(60);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
  doc.text('HISTORIQUE DES PAIEMENTS', left, y);
  y += 16;
  if (data.payments.length) {
    const pc = { date: left + 6, mode: left + 80, ref: left + 180, status: left + 320, amount: right - 106 };
    tableHeader([
      ['Date', pc.date, 70],
      ['Mode', pc.mode, 95],
      ['Référence', pc.ref, 135],
      ['Statut', pc.status, 85],
      ['Montant', pc.amount, 100, 'right'],
    ]);
    for (const p of data.payments) {
      ensure(20);
      doc.font('Helvetica').fontSize(9).fillColor(p.validated ? '#334155' : '#94a3b8');
      doc.text(frDate(p.date), pc.date, y, { width: 70 });
      doc.text(pdfText(p.mode || '—'), pc.mode, y, { width: 95 });
      doc.text(pdfText(p.reference || '—'), pc.ref, y, { width: 135, height: 11, ellipsis: true });
      doc.text(pdfText(p.status || '—'), pc.status, y, { width: 85 });
      doc.text(pdfText(money(p.amount)), pc.amount, y, { width: 100, align: 'right' });
      y += 15;
      separator();
    }
    if (data.payments.some((p) => !p.validated)) {
      ensure(14);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b');
      doc.text('Seuls les paiements validés sont comptés dans le total payé.', left, y, { width });
      y += 14;
    }
  } else {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text('Aucun paiement enregistré.', left, y);
    y += 16;
  }
  y += 6;
  totalLine('Total payé', money(data.paid), { bold: true, color: '#059669' });
  totalLine('Reste à payer', money(data.remaining), {
    bold: true,
    color: data.remaining > 0 ? '#dc2626' : '#0f172a',
  });
  if (data.cancelled) {
    ensure(16);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#dc2626');
    doc.text('Facture annulée : exclue des totaux du dossier.', left, y, { width });
    y += 16;
  }

  // ── Pied de page (sur chaque page) ──
  const generated = data.generatedAt ?? new Date();
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Sous la marge basse : sans cela pdfkit ouvrirait une page de plus.
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 60;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor('#e2e8f0').stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
    doc.text(
      pdfText(`Copie générée pour l'export hors-ligne le ${frDate(generated)} — page ${i - range.start + 1}/${range.count}`),
      left,
      footerY + 8,
      { width, align: 'center', lineBreak: false },
    );
  }

  doc.end();
  return done;
}
