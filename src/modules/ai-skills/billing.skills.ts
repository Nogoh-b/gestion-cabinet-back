// src/modules/ai-skills/billing.skills.ts
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import type {
  AiSkillContext,
  AiSkillDefinition,
  AiSkillFollowUp,
  AiSkillHandler,
  AiSkillOutcome,
  DocumentDraft,
} from 'src/core/ai-database/skills/ai-skill.types';
import { htmlToText, todayFr } from 'src/core/ai-database/skills/skill-helpers';
import type { AiActionDefinition, AiActionHandler, PreparedAiAction } from 'src/core/ai-database/write/ai-action.registry';
import { Permission } from 'src/core/enums/permission.enum';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { BillingMode } from '../case-workflow/case-workflow.enums';
import { ActionDefinition } from '../case-workflow/entities/action-catalog.entity';
import { DossierBillingProfile } from '../case-workflow/entities/billing.entity';
import { CaseBillingService, type ProfileSyncSummary } from '../case-workflow/services/case-billing.service';
import { gatherSources } from './document-studio.skills';
import { actionPlan, draftJson, DRAFTING_RULES, isOutcome, legalBlockFor, senderLine, str, strList, targetOrClarify } from './skill-drafting';
import { customerName, SkillTargetsService, TargetInfo } from './skill-targets.service';
import { pdfText } from './skill-templates';

/**
 * Facturation d'un dossier par le chat (2026-10-21) : l'IA lit le dossier,
 * son profil de facturation, les tarifs du catalogue d'actions, les pièces
 * (convention d'honoraires, lettre de mission…) et la consigne, puis propose
 * la configuration (forfait, horaire, ouverture, honoraire de résultat…) et le
 * devis. La configuration ne s'applique qu'après confirmation, par le même
 * service que l'onglet Facturation du dossier ; le devis est un document
 * (Word / PDF, classable, envoyable).
 */

/** Champs du profil que la compétence peut proposer. */
export interface BillingProfileProposal {
  mode?: BillingMode;
  fixed_fee?: number | null;
  hourly_rate?: number | null;
  percentage_rate?: number | null;
  percentage_base?: number | null;
  opening_fee?: number | null;
  opening_fee_enabled?: boolean;
  opening_fee_included_in_fixed_fee?: boolean;
  default_vacation_rate?: number | null;
  result_fee_enabled?: boolean;
  result_fee_rate?: number | null;
  rebill_expenses?: boolean;
  rebill_disbursements?: boolean;
  vat_rate?: number;
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface BillingProposal {
  profile: BillingProfileProposal;
  lines: QuoteLine[];
  vatRate: number;
  currency: string;
  validityDays: number;
  conditions: string;
  rationale: string;
  checks: string[];
  sources: Array<{ name: string; origin: 'dossier' | 'chat' }>;
}

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  [BillingMode.FIXED]: 'Forfait',
  [BillingMode.HOURLY]: 'Taux horaire',
  [BillingMode.PERCENTAGE]: 'Pourcentage',
  [BillingMode.MIXED]: 'Mixte (forfait + horaire / résultat)',
};

/** « 500 000 FCFA », « 1 250,50 », 500000 → nombre (null si vide ou illisible). */
export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').replace(/[^\d,.-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  if (!text || text === '-' || text === '.') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'oui', 'yes', '1'].includes(text)) return true;
  if (['false', 'non', 'no', '0'].includes(text)) return false;
  return undefined;
}

function parseMode(value: unknown): BillingMode | undefined {
  const text = String(value ?? '').trim().toUpperCase();
  if ((Object.values(BillingMode) as string[]).includes(text)) return text as BillingMode;
  if (/FORFAIT/.test(text)) return BillingMode.FIXED;
  if (/HORAIRE|HOUR/.test(text)) return BillingMode.HOURLY;
  if (/POURCENT|PERCENT/.test(text)) return BillingMode.PERCENTAGE;
  if (/MIXTE|MIXED/.test(text)) return BillingMode.MIXED;
  return undefined;
}

const nonNegative = (value: unknown, max?: number): number | null | undefined => {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  const number = parseAmount(value);
  if (number === null || number < 0) return undefined;
  return max !== undefined ? Math.min(number, max) : number;
};

/** Profil proposé, borné : énumération du mode, montants positifs, taux entre 0 et 100. */
export function cleanProfileProposal(raw: Record<string, unknown> | null | undefined): BillingProfileProposal {
  const source = raw ?? {};
  const out: BillingProfileProposal = {};
  const mode = parseMode(source.mode);
  if (mode) out.mode = mode;
  for (const key of ['fixed_fee', 'hourly_rate', 'percentage_base', 'opening_fee', 'default_vacation_rate'] as const) {
    const value = nonNegative(source[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of ['percentage_rate', 'result_fee_rate'] as const) {
    const value = nonNegative(source[key], 100);
    if (value !== undefined) out[key] = value;
  }
  const vat = nonNegative(source.vat_rate, 100);
  if (typeof vat === 'number') out.vat_rate = vat;
  for (const key of ['opening_fee_enabled', 'opening_fee_included_in_fixed_fee', 'result_fee_enabled', 'rebill_expenses', 'rebill_disbursements'] as const) {
    const value = parseBool(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Lignes du devis : celles du modèle, sinon celles qui découlent du profil. */
export function quoteLines(raw: unknown, profile: BillingProfileProposal): QuoteLine[] {
  const lines = (Array.isArray(raw) ? raw : [])
    .map((item: any) => ({
      label: str(item?.label, 200),
      quantity: Math.max(0, parseAmount(item?.quantity) ?? 1) || 1,
      unit: str(item?.unit, 30) || 'forfait',
      unitPrice: Math.max(0, parseAmount(item?.unit_price ?? item?.unitPrice) ?? 0),
    }))
    .filter((line) => line.label && line.unitPrice > 0)
    .slice(0, 20);
  if (lines.length) return lines;
  const derived: QuoteLine[] = [];
  if (profile.opening_fee_enabled && profile.opening_fee && !profile.opening_fee_included_in_fixed_fee) {
    derived.push({ label: "Frais d'ouverture du dossier", quantity: 1, unit: 'forfait', unitPrice: profile.opening_fee });
  }
  if (profile.fixed_fee) derived.push({ label: 'Honoraires forfaitaires', quantity: 1, unit: 'forfait', unitPrice: profile.fixed_fee });
  return derived;
}

export function quoteTotals(lines: QuoteLine[], vatRate: number) {
  const totalHt = Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const vat = Math.round((totalHt * vatRate) / 100);
  return { totalHt, vat, totalTtc: totalHt + vat };
}

const money = (value: number | null | undefined, currency = 'FCFA') =>
  value === null || value === undefined ? '—' : `${Math.round(value).toLocaleString('fr-FR')} ${currency}`;

/** Proposition passée par un bouton de suite (devis → configuration) : revalidée. */
export function proposalFromParams(raw: unknown): BillingProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, any>;
  const profile = cleanProfileProposal(value.profile);
  const vatRate = nonNegative(value.vatRate, 100) ?? profile.vat_rate ?? 0;
  return {
    profile,
    lines: quoteLines(value.lines?.map((line: any) => ({ ...line, unit_price: line.unitPrice ?? line.unit_price })), profile),
    vatRate: typeof vatRate === 'number' ? vatRate : 0,
    currency: str(value.currency, 10) || 'FCFA',
    validityDays: Math.min(365, Math.max(1, parseAmount(value.validityDays) ?? 30)),
    conditions: str(value.conditions, 3000),
    rationale: str(value.rationale, 3000),
    checks: strList(value.checks, 300).slice(0, 10),
    sources: Array.isArray(value.sources) ? value.sources.slice(0, 20) : [],
  };
}

/** Tableau markdown du devis (réponse du chat). */
function quoteMarkdown(proposal: BillingProposal): string {
  if (!proposal.lines.length) return '_Aucune ligne de devis : précisez les honoraires dans votre demande._';
  const totals = quoteTotals(proposal.lines, proposal.vatRate);
  return [
    '| Prestation | Qté | Prix unitaire | Montant HT |',
    '|---|---:|---:|---:|',
    ...proposal.lines.map((line) => `| ${line.label.replace(/\|/g, '/')} | ${line.quantity} ${line.unit} | ${money(line.unitPrice, proposal.currency)} | ${money(line.quantity * line.unitPrice, proposal.currency)} |`),
    `| **Total HT** | | | **${money(totals.totalHt, proposal.currency)}** |`,
    `| TVA ${proposal.vatRate.toLocaleString('fr-FR')} % | | | ${money(totals.vat, proposal.currency)} |`,
    `| **Total TTC** | | | **${money(totals.totalTtc, proposal.currency)}** |`,
  ].join('\n');
}

/** Résumé lisible du profil proposé. */
export function profileSummary(profile: BillingProfileProposal, currency = 'FCFA'): string[] {
  const lines: string[] = [];
  if (profile.mode) lines.push(`Mode : **${BILLING_MODE_LABELS[profile.mode]}**`);
  if (profile.fixed_fee !== undefined) lines.push(`Forfait : ${money(profile.fixed_fee, currency)}`);
  if (profile.hourly_rate !== undefined) lines.push(`Taux horaire : ${money(profile.hourly_rate, currency)}`);
  if (profile.percentage_rate !== undefined) lines.push(`Pourcentage : ${profile.percentage_rate ?? '—'} %${profile.percentage_base ? ` de ${money(profile.percentage_base, currency)}` : ''}`);
  if (profile.opening_fee_enabled !== undefined || profile.opening_fee !== undefined) {
    lines.push(`Frais d'ouverture : ${profile.opening_fee_enabled === false ? 'non' : money(profile.opening_fee, currency)}${profile.opening_fee_included_in_fixed_fee ? ' (inclus dans le forfait)' : ''}`);
  }
  if (profile.default_vacation_rate !== undefined) lines.push(`Vacation : ${money(profile.default_vacation_rate, currency)}`);
  if (profile.result_fee_enabled !== undefined) lines.push(`Honoraire de résultat : ${profile.result_fee_enabled ? `${profile.result_fee_rate ?? '—'} %` : 'non'}`);
  if (profile.rebill_expenses !== undefined) lines.push(`Frais refacturés : ${profile.rebill_expenses ? 'oui' : 'non'}`);
  if (profile.vat_rate !== undefined) lines.push(`TVA : ${profile.vat_rate} %`);
  return lines;
}

// ── Lecture du dossier et proposition ───────────────────────────────────────

interface BillingDeps {
  dataSource: DataSource;
  targets: SkillTargetsService;
  permissions?: AiDatabasePermissionService;
}

async function currentProfile(dataSource: DataSource, dossierId: number): Promise<DossierBillingProfile | null> {
  return dataSource.getRepository(DossierBillingProfile).findOne({ where: { dossier_id: dossierId } as any }).catch(() => null);
}

/** Profil actuel du dossier, en clair pour le modèle. */
function profileFacts(profile: DossierBillingProfile | null, currency: string): string {
  if (!profile) return 'Profil de facturation actuel : aucun (valeurs par défaut du cabinet).';
  return `Profil de facturation actuel : ${profileSummary({
    mode: profile.mode as BillingMode,
    fixed_fee: profile.fixed_fee != null ? Number(profile.fixed_fee) : null,
    hourly_rate: profile.hourly_rate != null ? Number(profile.hourly_rate) : null,
    percentage_rate: profile.percentage_rate != null ? Number(profile.percentage_rate) : null,
    opening_fee: profile.opening_fee != null ? Number(profile.opening_fee) : null,
    opening_fee_enabled: !!profile.opening_fee_enabled,
    result_fee_enabled: !!profile.result_fee_enabled,
    result_fee_rate: profile.result_fee_rate != null ? Number(profile.result_fee_rate) : null,
    rebill_expenses: !!profile.rebill_expenses,
    vat_rate: Number(profile.vat_rate ?? 0),
  }, currency).join(' ; ').replace(/\*\*/g, '')}${profile.is_confirmed ? ' (confirmé)' : ' (non confirmé)'}.`;
}

/** Tarifs du catalogue d'actions (seule source de montants avec la consigne et les pièces). */
async function catalogTariffs(dataSource: DataSource, currency: string): Promise<string> {
  const items = await dataSource.getRepository(ActionDefinition)
    .find({ where: { is_active: true } as any, take: 60 })
    .catch(() => [] as ActionDefinition[]);
  const priced = items.filter((item: any) => item.default_rate != null && Number(item.default_rate) > 0).slice(0, 30);
  if (!priced.length) return "Tarifs du catalogue d'actions : aucun tarif renseigné.";
  return `Tarifs du catalogue d'actions du cabinet :\n${priced
    .map((item: any) => `- ${item.label} : ${item.billing_mode === 'PERCENTAGE' ? `${item.default_rate} %` : money(Number(item.default_rate), currency)}${item.billing_mode ? ` (${item.billing_mode})` : ''}`)
    .join('\n')}`;
}

export async function computeBillingProposal(ctx: AiSkillContext, deps: BillingDeps, info: TargetInfo): Promise<BillingProposal> {
  const dossier = info.dossier!;
  const cabinet = await deps.dataSource.getRepository(Cabinet).findOne({ where: { id: getCurrentTenantId() } as any }).catch(() => null);
  const currency = cabinet?.currency && cabinet.currency !== 'XAF' ? cabinet.currency : 'FCFA';
  const profile = await currentProfile(deps.dataSource, dossier.id);
  const defaultVat = Number(profile?.vat_rate ?? cabinet?.default_tva_rate ?? 0);
  ctx.status('📂 Lecture du dossier, de ses pièces et des tarifs…');
  const gathered = await gatherSources(ctx, { targets: deps.targets, permissions: deps.permissions }, info, { maxPieces: 8, budget: 50_000 });
  const sender = await deps.targets.sender(ctx.userId);
  ctx.status('🧮 Proposition de facturation…');
  const raw = await draftJson<Record<string, any>>(ctx, `Tu es l'assistant de facturation d'un cabinet d'avocats (Cameroun, OHADA). Propose la configuration de facturation du dossier et le devis d'honoraires correspondant, d'après la consigne de l'utilisateur, les informations du dossier, son profil actuel, les tarifs du cabinet et les pièces (convention d'honoraires, lettre de mission…).

Consigne de l'utilisateur : ${ctx.question}

Informations du dossier :
${await deps.targets.facts(info, ctx.user, ctx.question)}
${dossier.budget_estimate ? `Budget estimé du dossier : ${money(Number(dossier.budget_estimate), currency)}` : ''}
${profileFacts(profile, currency)}
TVA par défaut du cabinet : ${defaultVat} %
${await catalogTariffs(deps.dataSource, currency)}
${senderLine(sender, 'Avocat')}
Date du jour : ${todayFr()}

${gathered.block || 'Aucune pièce lue.'}

${await legalBlockFor(ctx)}

Règles :
- Montants : seulement ceux de la consigne, des pièces, du profil actuel ou des tarifs du cabinet. Un montant inconnu reste null et devient un point à vérifier ; n'en invente aucun.
- mode : FIXED (forfait), HOURLY (taux horaire), PERCENTAGE (pourcentage d'un montant), MIXED (forfait + horaire ou résultat).
- Garde les valeurs actuelles que la consigne ne change pas (n'écris que les champs à fixer ou à changer).
- Lignes du devis : chaque prestation facturée (frais d'ouverture, forfait, heures estimées, vacations…), quantité, unité et prix unitaire HT.
${DRAFTING_RULES}

Réponds UNIQUEMENT en JSON :
{"profile": {"mode": "FIXED|HOURLY|PERCENTAGE|MIXED", "fixed_fee": nombre ou null, "hourly_rate": nombre ou null, "percentage_rate": nombre ou null, "percentage_base": nombre ou null, "opening_fee": nombre ou null, "opening_fee_enabled": true/false, "opening_fee_included_in_fixed_fee": true/false, "default_vacation_rate": nombre ou null, "result_fee_enabled": true/false, "result_fee_rate": nombre ou null, "rebill_expenses": true/false, "rebill_disbursements": true/false, "vat_rate": nombre},
 "lines": [{"label": "prestation", "quantity": 1, "unit": "forfait|heure|vacation", "unit_price": nombre}],
 "validity_days": 30,
 "conditions": "modalités de paiement et conditions du devis (2 à 4 phrases)",
 "rationale": "pourquoi cette configuration (2 à 4 phrases, en citant la consigne ou la pièce)",
 "checks": ["point à vérifier"]}`, 3000);
  const cleaned = cleanProfileProposal(raw.profile);
  const vatRate = cleaned.vat_rate ?? defaultVat;
  const checks = strList(raw.checks, 300).slice(0, 8);
  if (gathered.denied) checks.push('Pièces du dossier non lues : le droit « voir les documents » est nécessaire.');
  return {
    profile: cleaned,
    lines: quoteLines(raw.lines, cleaned),
    vatRate,
    currency,
    validityDays: Math.min(365, Math.max(1, parseAmount(raw.validity_days) ?? 30)),
    conditions: str(raw.conditions, 3000),
    rationale: str(raw.rationale, 3000),
    checks,
    sources: gathered.sources,
  };
}

/** Champs de la carte de confirmation (textes, comme les saisit l'utilisateur). */
function actionFields(profile: BillingProfileProposal): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (value === undefined) continue;
    fields[key] = typeof value === 'boolean' ? (value ? 'oui' : 'non') : value === null ? '' : String(value);
  }
  return fields;
}

// ── Compétence « Configurer la facturation » ────────────────────────────────

@Injectable()
export class ConfigurerFacturationSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'configurer_facturation',
    label: 'Configurer la facturation',
    description: 'Propose et applique le profil de facturation du dossier (forfait, horaire, ouverture…) d’après ses pièces',
    icon: 'receipt',
    category: 'facturation',
    permissions: [Permission.MANAGE_BILLABLE_ITEMS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Ex. forfait de 500 000 FCFA, ouverture 50 000 incluse, 10 % du montant recouvré',
    examples: ['Configure la facturation de @dossier : forfait 500 000 FCFA et 10 % du résultat'],
    keywords: ['facturation', 'honoraires', 'forfait', 'tarif', 'configurer', 'profil'],
    autoTriggers: [
      'configurer la facturation', 'configure la facturation', 'configuration de la facturation', 'parametre la facturation',
      '/\\b(?:configure[rz]?|parametre[rz]?|definis|definir|definissez|fixe[rz]?|propose[rz]?|applique[rz]?)\\b.{0,40}\\b(?:facturation|honoraires|tarification)\\b/',
    ],
    autoExclude: ['convention', 'devis', 'facture', 'factures', 'relance', 'relancer', 'comment'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly permissions?: AiDatabasePermissionService,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    if (!info.dossier) return { type: 'clarify', markdown: '❓ Mentionnez le **dossier** à configurer avec **@**.' };
    const proposal = proposalFromParams(ctx.params.proposal)
      ?? await computeBillingProposal(ctx, { dataSource: this.dataSource, targets: this.targets, permissions: this.permissions }, info);
    if (!Object.keys(proposal.profile).length) {
      return { type: 'clarify', markdown: '❓ Je n’ai trouvé aucun élément de facturation à appliquer : précisez le mode (forfait, horaire…) et les montants dans votre demande.' };
    }
    const dossierRef = { type: 'dossier', id: info.dossier.id, label: info.dossier.dossier_number };
    const followUps: AiSkillFollowUp[] = [{
      label: 'Générer le devis (Word / PDF)',
      skill: 'devis_honoraires',
      question: `Génère le devis d'honoraires du dossier ${info.dossier.dossier_number}.`,
      params: { target: dossierRef, proposal },
      reference: { ...dossierRef, href: `/dossiers/${info.dossier.id}` },
    }];
    return {
      type: 'plan',
      markdown: [
        `🧾 **Facturation proposée — dossier ${info.dossier.dossier_number}**`,
        '',
        ...profileSummary(proposal.profile, proposal.currency).map((line) => `- ${line}`),
        '',
        quoteMarkdown(proposal),
        proposal.rationale ? `\n${proposal.rationale}` : '',
        proposal.sources.length ? `\n_Pièces lues : ${proposal.sources.map((source) => source.name).join(', ')}._` : '',
        proposal.checks.length ? `\n**À vérifier**\n${proposal.checks.map((item) => `- ${item}`).join('\n')}` : '',
      ].filter((line) => line !== undefined).join('\n'),
      plan: actionPlan('configurer_facturation', 'dossiers', info.dossier.id, actionFields(proposal.profile), `Appliquer la facturation proposée au dossier ${info.dossier.dossier_number}`),
      followUps,
    };
  }
}

// ── Compétence « Devis d'honoraires » ───────────────────────────────────────

/** HTML du devis (studio : aperçu, éditeur, Word, PDF). Texte échappé. */
export function quoteHtml(proposal: BillingProposal, info: TargetInfo, sender: { name: string; title: string; cabinetName: string; cabinetAddress: string }): string {
  const dossier = info.dossier!;
  const client = customerName(info.client);
  const totals = quoteTotals(proposal.lines, proposal.vatRate);
  const cur = proposal.currency;
  const cell = (value: unknown, align: 'left' | 'right' = 'left') => `<td style="text-align:${align}; vertical-align:top;">${pdfText(value)}</td>`;
  const modalities = profileSummary(proposal.profile, cur).map((line) => `<li>${pdfText(line.replace(/\*\*/g, ''))}</li>`).join('');
  return [
    `<h1 style="text-align:center;">DEVIS D'HONORAIRES</h1>`,
    `<p><strong>Client :</strong> ${pdfText(client || '………')}<br/><strong>Dossier :</strong> ${pdfText(dossier.dossier_number)}${dossier.object ? ` — ${pdfText(htmlToText(dossier.object).slice(0, 200))}` : ''}<br/><strong>Date :</strong> ${pdfText(todayFr())}<br/><strong>Validité :</strong> ${proposal.validityDays} jours</p>`,
    `<h2>Prestations</h2>`,
    `<table style="width:100%;"><thead><tr><th style="text-align:left;">Prestation</th><th style="text-align:right;">Qté</th><th style="text-align:right;">Prix unitaire HT</th><th style="text-align:right;">Montant HT</th></tr></thead><tbody>${proposal.lines
      .map((line) => `<tr>${cell(line.label)}${cell(`${line.quantity} ${line.unit}`, 'right')}${cell(money(line.unitPrice, cur), 'right')}${cell(money(line.quantity * line.unitPrice, cur), 'right')}</tr>`)
      .join('')}</tbody></table>`,
    `<table style="width:60%; margin-left:auto;"><tbody><tr><td><strong>Total HT</strong></td>${cell(money(totals.totalHt, cur), 'right')}</tr><tr><td>TVA ${pdfText(proposal.vatRate.toLocaleString('fr-FR'))} %</td>${cell(money(totals.vat, cur), 'right')}</tr><tr><td><strong>Total TTC</strong></td><td style="text-align:right;"><strong>${pdfText(money(totals.totalTtc, cur))}</strong></td></tr></tbody></table>`,
    modalities ? `<h2>Modalités de facturation</h2><ul>${modalities}</ul>` : '',
    proposal.conditions ? `<h2>Conditions</h2><p>${pdfText(proposal.conditions)}</p>` : '',
    `<p>Fait le ${pdfText(todayFr())}.</p>`,
    `<p style="text-align:right;">${pdfText(sender.name || '………')}${sender.title ? `<br/>${pdfText(sender.title)}` : ''}${sender.cabinetName ? `<br/>${pdfText(sender.cabinetName)}` : ''}</p>`,
    `<p>Bon pour accord — le client (date et signature) :</p>`,
  ].filter(Boolean).join('\n');
}

@Injectable()
export class DevisHonorairesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'devis_honoraires',
    label: "Devis d'honoraires",
    description: 'Établit le devis du dossier (Word / PDF) d’après ses paramètres, ses pièces et votre consigne',
    icon: 'file-text',
    category: 'facturation',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Ex. devis au forfait de 500 000 FCFA + frais d’ouverture, valable 30 jours',
    examples: ["Fais le devis d'honoraires de @dossier"],
    keywords: ['devis', 'honoraires', 'estimation', 'proposition', 'tarif'],
    autoTriggers: ['devis', 'proposition d honoraires', 'estimation des honoraires', 'estimation d honoraires'],
    autoExclude: ['comment', 'convention'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly permissions?: AiDatabasePermissionService,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    if (!info.dossier) return { type: 'clarify', markdown: '❓ Mentionnez le **dossier** du devis avec **@**.' };
    const proposal = proposalFromParams(ctx.params.proposal)
      ?? await computeBillingProposal(ctx, { dataSource: this.dataSource, targets: this.targets, permissions: this.permissions }, info);
    if (!proposal.lines.length) {
      return { type: 'clarify', markdown: '❓ Aucun montant n’a pu être établi pour ce devis : précisez les honoraires (forfait, taux horaire, frais d’ouverture…) dans votre demande.' };
    }
    const sender = await this.targets.sender(ctx.userId);
    const name = `Devis d'honoraires - ${info.dossier.dossier_number}`;
    const draft: DocumentDraft = {
      templateId: 0,
      templateCode: 'studio_document',
      templateName: "Devis d'honoraires",
      entityType: 'dossier',
      entityId: info.dossier.id,
      dossierId: info.dossier.id,
      dossierLabel: info.dossier.dossier_number,
      fileName: name,
      variables: {},
      editable: [],
      ...(info.client && { recipient: { type: 'client', id: info.client.id, label: customerName(info.client) } }),
      studio: { mode: 'document', html: quoteHtml(proposal, info, sender), title: '', sources: proposal.sources, checks: proposal.checks },
    };
    const dossierRef = { type: 'dossier', id: info.dossier.id, label: info.dossier.dossier_number };
    const totals = quoteTotals(proposal.lines, proposal.vatRate);
    return {
      type: 'document_draft',
      markdown: `🧾 **Devis d'honoraires — dossier ${info.dossier.dossier_number}** : ${money(totals.totalTtc, proposal.currency)} TTC (${money(totals.totalHt, proposal.currency)} HT). Relisez-le dans la carte, puis **Word** ou **PDF**, classement dans le dossier ou envoi par e-mail.${proposal.checks.length ? `\n\n**À vérifier**\n${proposal.checks.map((item) => `- ${item}`).join('\n')}` : ''}`,
      draft,
      followUps: [{
        label: 'Appliquer cette facturation au dossier',
        skill: 'configurer_facturation',
        question: `Applique la facturation du devis au dossier ${info.dossier.dossier_number}.`,
        params: { target: dossierRef, proposal },
        reference: { ...dossierRef, href: `/dossiers/${info.dossier.id}` },
      }],
    };
  }
}

// ── Action « configurer_facturation » (toujours confirmée) ──────────────────

const YES_NO = [{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }];

function syncSummary(sync: ProfileSyncSummary | undefined): string {
  if (!sync) return '';
  const parts = [
    sync.updated_items.length ? `${sync.updated_items.length} élément(s) à facturer recalculé(s)` : '',
    sync.created_items.length ? `${sync.created_items.length} élément(s) créé(s)` : '',
    sync.updated_invoices.length ? `facture(s) brouillon ajustée(s) : ${sync.updated_invoices.map((item) => item.numero).join(', ')}` : '',
    sync.locked_invoices.length ? `facture(s) déjà émise(s) inchangée(s) (avoir ou facture complémentaire à faire) : ${sync.locked_invoices.map((item) => item.numero).join(', ')}` : '',
    sync.needs_review.length ? `${sync.needs_review.length} élément(s) à revoir` : '',
  ].filter(Boolean);
  return parts.length ? ` — ${parts.join(' ; ')}` : '';
}

@Injectable()
export class ConfigurerFacturationAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'configurer_facturation',
    entity: 'dossiers',
    skillOnly: true,
    label: 'Configuration de la facturation',
    description: "Applique le profil de facturation proposé au dossier (même enregistrement que l'onglet Facturation).",
    permission: Permission.MANAGE_BILLABLE_ITEMS,
    params: [
      { name: 'mode', label: 'Mode de facturation', kind: 'enum' },
      { name: 'fixed_fee', label: 'Forfait (HT)' },
      { name: 'hourly_rate', label: 'Taux horaire (HT)' },
      { name: 'percentage_rate', label: 'Pourcentage (%)' },
      { name: 'percentage_base', label: 'Base du pourcentage' },
      { name: 'opening_fee_enabled', label: "Frais d'ouverture", kind: 'enum' },
      { name: 'opening_fee', label: "Montant des frais d'ouverture" },
      { name: 'opening_fee_included_in_fixed_fee', label: 'Ouverture incluse dans le forfait', kind: 'enum' },
      { name: 'default_vacation_rate', label: 'Vacation (HT)' },
      { name: 'result_fee_enabled', label: 'Honoraire de résultat', kind: 'enum' },
      { name: 'result_fee_rate', label: 'Honoraire de résultat (%)' },
      { name: 'rebill_expenses', label: 'Refacturer les frais', kind: 'enum' },
      { name: 'rebill_disbursements', label: 'Refacturer les débours', kind: 'enum' },
      { name: 'vat_rate', label: 'TVA (%)' },
    ],
    warning: "Le forfait et les frais d'ouverture à facturer, et les factures brouillon du dossier, suivent la nouvelle configuration ; une facture déjà émise ne change pas.",
  };

  constructor(
    private readonly billing: CaseBillingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async paramOptions() {
    return {
      mode: Object.values(BillingMode).map((value) => ({ value, label: BILLING_MODE_LABELS[value] })),
      opening_fee_enabled: YES_NO,
      opening_fee_included_in_fixed_fee: YES_NO,
      result_fee_enabled: YES_NO,
      rebill_expenses: YES_NO,
      rebill_disbursements: YES_NO,
    };
  }

  async preview(targetId: string | number): Promise<string> {
    const profile = await currentProfile(this.dataSource, Number(targetId));
    return profile
      ? `Actuellement : ${BILLING_MODE_LABELS[profile.mode as BillingMode] ?? profile.mode}${profile.fixed_fee != null ? ` · forfait ${money(Number(profile.fixed_fee))}` : ''}${profile.hourly_rate != null ? ` · ${money(Number(profile.hourly_rate))}/h` : ''}${profile.is_confirmed ? ' · confirmé' : ''}`
      : 'Aucune facturation configurée pour ce dossier.';
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const dossierId = Number(targetId);
    if (!Number.isInteger(dossierId) || dossierId <= 0) throw new BadRequestException('Dossier introuvable.');
    const changes = cleanProfileProposal(params);
    if (!Object.keys(changes).length) throw new BadRequestException('Aucun champ de facturation à appliquer.');
    const profile = await currentProfile(this.dataSource, dossierId);
    return {
      data: { id: dossierId },
      plannedMessage: `Facturation du dossier à mettre à jour (${Object.keys(changes).length} champ(s)).`,
      run: async () => {
        const saved = await this.billing.updateProfile(
          dossierId,
          { ...changes, ...(profile?.lock_version && { expected_version: profile.lock_version }) } as any,
          Number(userId) || 0,
        );
        return `Facturation du dossier mise à jour : ${BILLING_MODE_LABELS[saved.mode as BillingMode] ?? saved.mode}${syncSummary(saved.billing_sync)}.`;
      },
    };
  }
}
