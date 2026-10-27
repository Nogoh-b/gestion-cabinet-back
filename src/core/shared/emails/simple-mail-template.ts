/**
 * Gabarit HTML sobre pour les emails émis par la plateforme (OTP, factures
 * d'abonnement, relances…) : en-tête de marque, titre, paragraphes, bloc mis
 * en avant, bouton d'action. Tout le contenu est échappé.
 */
export interface SimpleMailInput {
  brand?: string;
  title: string;
  /** Paragraphes en texte brut. */
  paragraphs: string[];
  /** Bloc mis en avant (code, montant…). */
  highlight?: string;
  /** Lignes clé/valeur (récapitulatif). */
  details?: Array<[string, string]>;
  action?: { label: string; url: string };
  footer?: string;
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSimpleMail(input: SimpleMailInput): string {
  const brand = escapeHtml(input.brand || process.env.PLATFORM_NAME || 'KabySoft');
  const paragraphs = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`)
    .join('');
  const highlight = input.highlight
    ? `<div style="margin:18px 0;padding:14px 18px;border-radius:8px;background:#f1f5f9;font-size:24px;font-weight:700;letter-spacing:4px;text-align:center">${escapeHtml(input.highlight)}</div>`
    : '';
  const details = input.details?.length
    ? `<table style="width:100%;margin:8px 0 18px;border-collapse:collapse;font-size:14px">${input.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 0;color:#64748b;border-bottom:1px solid #f1f5f9">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #f1f5f9">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const action = input.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(input.action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(input.action.url)}</p>`
    : '';
  const footer = escapeHtml(input.footer ?? 'Message automatique — merci de ne pas répondre.');
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="padding:16px 24px;background:#0f172a;color:#ffffff;font-weight:700">${brand}</div>
      <div style="padding:24px">
        <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(input.title)}</h1>
        ${paragraphs}${highlight}${details}${action}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">${footer}</div>
    </div></body></html>`;
}

export function renderSimpleText(input: SimpleMailInput): string {
  return [
    input.title,
    ...input.paragraphs,
    input.highlight ?? '',
    ...(input.details ?? []).map(([k, v]) => `${k} : ${v}`),
    input.action?.url ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
