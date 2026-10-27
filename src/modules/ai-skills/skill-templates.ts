// src/modules/ai-skills/skill-templates.ts
import type { DocumentDraft, InlinePdfTemplate } from 'src/core/ai-database/skills/ai-skill.types';
import { todayFr } from 'src/core/ai-database/skills/skill-helpers';
import { customerName, TargetInfo } from './skill-targets.service';

/**
 * Mises en page PDF des compétences d'analyse et d'actes (note, acte de
 * procédure, convention, version bilingue). Le chat les rend comme les
 * modèles du cabinet : en-tête et pied de page du cabinet, titre encadré.
 * Toute donnée insérée en HTML brut est échappée ici.
 */

const SIGNATURE = `
  {{#if signatoryName}}
  <div style="margin-top:28px; text-align:right;">
    <div>Fait le {{date_fmt}}</div>
    <div style="font-weight:bold; margin-top:6px;">{{signatoryName}}</div>
    <div style="font-size:9px; color:#64748b;">{{signatoryTitle}}</div>
  </div>
  {{/if}}`;

const LAYOUTS: Record<string, { variant: string; body: string; orientation?: 'portrait' | 'landscape' }> = {
  /** Note d'analyse, chronologie, audit, dossier de plaidoirie, décompte. */
  skill_note: {
    variant: 'note',
    body: `
<div style="padding:16px;">
  {{#if documentSubtitle}}<p style="font-size:10px; color:#475569; margin-bottom:10px;">{{documentSubtitle}}</p>{{/if}}
  <div style="line-height:1.5;">{{bodyContent}}</div>
  ${SIGNATURE}
</div>`,
  },
  /** Acte de procédure : conclusions, requête. */
  skill_acte: {
    variant: 'acte',
    body: `
<div style="padding:16px;">
  {{#if juridiction}}<p style="text-align:center; font-weight:bold; font-size:11px;">{{juridiction}}</p>{{/if}}
  {{#if reference}}<p style="text-align:center; font-size:9px; color:#475569;">{{reference}}</p>{{/if}}
  {{#if partiesBlock}}<div style="margin-top:12px;">{{partiesBlock}}</div>{{/if}}
  <div style="margin-top:14px; line-height:1.55;">{{bodyContent}}</div>
  <p style="margin-top:16px; font-weight:bold;">SOUS TOUTES RÉSERVES</p>
  ${SIGNATURE}
</div>`,
  },
  /** Convention d'honoraires : double signature. */
  skill_convention: {
    variant: 'convention',
    body: `
<div style="padding:16px;">
  {{#if partiesBlock}}<div style="margin-bottom:12px;">{{partiesBlock}}</div>{{/if}}
  <div style="line-height:1.5;">{{bodyContent}}</div>
  <p style="margin-top:18px;">Fait en deux exemplaires originaux, le {{date_fmt}}.</p>
  <table style="width:100%; margin-top:20px;">
    <tr>
      <td style="width:50%; border-top-width:0; border-bottom-width:0; border-left-width:0; border-right-width:0; vertical-align:top;">
        <div style="font-weight:bold;">Le client</div>
        <div style="font-size:9px; color:#64748b;">« Lu et approuvé »</div>
        <div style="margin-top:6px;">{{clientName}}</div>
      </td>
      <td style="width:50%; border-top-width:0; border-bottom-width:0; border-left-width:0; border-right-width:0; vertical-align:top; text-align:right;">
        <div style="font-weight:bold;">L'avocat</div>
        <div style="font-size:9px; color:#64748b;">« Lu et approuvé »</div>
        <div style="margin-top:6px;">{{signatoryName}}</div>
      </td>
    </tr>
  </table>
</div>`,
  },
  /** Version bilingue : deux colonnes français | anglais. */
  skill_bilingue: {
    variant: 'bilingue',
    orientation: 'landscape',
    body: `
<div style="padding:12px;">
  {{#if documentSubtitle}}<p style="font-size:10px; color:#475569; margin-bottom:8px;">{{documentSubtitle}}</p>{{/if}}
  {{bodyContent}}
</div>`,
  },
};

export type SkillLayout = keyof typeof LAYOUTS;

export function inlineTemplate(code: SkillLayout, name: string, title: string): InlinePdfTemplate {
  const layout = LAYOUTS[code];
  return {
    code,
    name,
    entity_type: 'general',
    variant: layout.variant,
    title: title.toUpperCase(),
    body_html: layout.body,
    orientation: layout.orientation ?? 'portrait',
    paper_size: 'a4',
    font_family: null,
    header_block_id: null,
    footer_block_id: null,
  };
}

// ── Petits constructeurs HTML (tout le texte est échappé) ──────────────────

/**
 * Texte inséré dans un PDF : le moteur du chat redécode `&lt;` / `&gt;` avant
 * d'analyser le HTML et n'interprète ni `&quot;` ni `&#39;`. Les chevrons
 * deviennent donc ‹ › et les guillemets restent tels quels.
 */
export function pdfText(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '‹').replace(/>/g, '›');
}

/** Tableau HTML ; `align` par colonne (« right » pour les montants). */
export function htmlTable(headers: string[], rows: Array<Array<string | number>>, align: Array<'left' | 'right' | 'center'> = []): string {
  const head = headers
    .map((label, i) => `<th style="text-align:${align[i] ?? 'left'};">${pdfText(label)}</th>`)
    .join('');
  const body = rows
    .map((row) => `<tr>${row.map((value, i) => `<td style="text-align:${align[i] ?? 'left'}; vertical-align:top;">${pdfText(value)}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="width:100%; margin:6px 0 10px 0;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function htmlHeading(text: string): string {
  return `<h3 style="margin-top:12px;">${pdfText(text)}</h3>`;
}

/** Paragraphes (lignes vides) et listes à puces (« - » ou « • » en tête de ligne). */
export function htmlText(text: string): string {
  return String(text ?? '')
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((line) => /^\s*[-•*]\s+/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${pdfText(line.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${pdfText(block).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

export function htmlList(items: string[]): string {
  const clean = items.map((item) => String(item ?? '').trim()).filter(Boolean);
  return clean.length ? `<ul>${clean.map((item) => `<li>${pdfText(item)}</li>`).join('')}</ul>` : '';
}

/** Tableau markdown pour la réponse du chat (cellules nettoyées). */
export function markdownTable(headers: string[], rows: Array<Array<string | number>>): string {
  const cell = (value: unknown) => String(value ?? '—').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim() || '—';
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

// ── Brouillon de document intégré ───────────────────────────────────────────

export interface InlineDraftInput {
  layout: SkillLayout;
  /** Nom du document dans la carte (« Chronologie du dossier »). */
  name: string;
  /** Titre encadré du PDF. */
  title: string;
  info?: TargetInfo | null;
  sender: { name: string; title: string; cabinetName: string };
  /** Variables HTML construites ici (corps en tableau…). */
  raw?: Record<string, string>;
  /** Variables texte modifiables dans la carte. */
  editable?: Array<{ name: string; label: string; kind: 'text' | 'longtext'; value: string }>;
  /** Autres variables fixes (juridiction, référence…). */
  extra?: Record<string, string>;
}

export function inlineDraft(input: InlineDraftInput): DocumentDraft {
  const { info, sender } = input;
  const dossier = info?.dossier;
  const suffix = dossier?.dossier_number ?? (info?.client ? customerName(info.client) : '');
  const editable = input.editable ?? [];
  return {
    templateId: 0,
    templateCode: input.layout,
    templateName: input.name,
    entityType: 'general',
    ...(dossier && { dossierId: dossier.id, dossierLabel: dossier.dossier_number }),
    fileName: `${input.name}${suffix ? ` - ${suffix}` : ''}`.slice(0, 120),
    variables: {
      date_fmt: todayFr(),
      signatoryName: sender.name,
      signatoryTitle: [sender.title, sender.cabinetName].filter(Boolean).join(' — '),
      documentSubtitle: dossier ? `Dossier ${dossier.dossier_number}${dossier.object ? ` — ${dossier.object}` : ''}` : '',
      ...input.extra,
      ...Object.fromEntries(editable.map((field) => [field.name, field.value])),
      ...input.raw,
    },
    editable: editable.map(({ name, label, kind }) => ({ name, label, kind })),
    rawVariables: Object.keys(input.raw ?? {}),
    template: inlineTemplate(input.layout, input.name, input.title),
    ...(info?.client && { recipient: { type: 'client', id: info.client.id, label: customerName(info.client) } }),
  };
}
