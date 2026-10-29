// src/modules/ai-skills/report.skills.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { AiSkillContext, AiSkillDefinition, AiSkillFollowUp, AiSkillHandler, AiSkillOutcome, ChartSpec } from 'src/core/ai-database/skills/ai-skill.types';
import { htmlToText, resolveOptionalSkillTarget } from 'src/core/ai-database/skills/skill-helpers';
import { normalizeActionName } from 'src/core/ai-database/write/ai-action.registry';
import { Permission } from 'src/core/enums/permission.enum';
import { Audience } from '../audiences/entities/audience.entity';
import { ReportsService } from '../reports/reports.service';
import { AUDIENCE_TRANSCRIPT_RULES, DRAFTING_RULES, isOutcome, senderLine, targetOrClarify } from './skill-drafting';
import { customerName, SkillTargetsService, unpaidInvoices } from './skill-targets.service';

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const money = (value: unknown) =>
  `${Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
const dateFr = (date: Date) => date.toLocaleDateString('fr-FR');
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const cell = (value: unknown) => String(value ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ');

/**
 * Période d'un rapport lue dans la demande : « du 01/09/2026 au 30/09/2026 »,
 * « septembre 2026 », « le mois dernier », « ce trimestre », « cette année »,
 * « 2025 ». Par défaut : le mois en cours jusqu'à aujourd'hui.
 */
export function parsePeriod(question: string, now = new Date()): { from: Date; to: Date; label: string } {
  const text = normalizeActionName(question).replace(/_/g, ' ');
  const y = now.getFullYear();
  const m = now.getMonth();
  const range = (from: Date, to: Date, label: string) => ({ from, to, label });

  const explicit = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\D+(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(question);
  if (explicit) {
    const [, d1, m1, y1, d2, m2, y2] = explicit.map(Number);
    const from = new Date(y1, m1 - 1, d1);
    const to = new Date(y2, m2 - 1, d2);
    return range(from, to, `du ${dateFr(from)} au ${dateFr(to)}`);
  }
  if (/\b(mois dernier|mois precedent)\b/.test(text)) {
    return range(new Date(y, m - 1, 1), new Date(y, m, 0), `${MONTHS[(m + 11) % 12]} ${m === 0 ? y - 1 : y}`);
  }
  if (/\b(semaine derniere|semaine precedente)\b/.test(text)) {
    const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7) - 7);
    return range(monday, new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6), 'la semaine dernière');
  }
  if (/\b(cette semaine|semaine en cours)\b/.test(text)) {
    return range(new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7)), now, 'cette semaine');
  }
  if (/\btrimestre (dernier|precedent)\b/.test(text)) {
    const q = Math.floor(m / 3) - 1;
    const year = q < 0 ? y - 1 : y;
    const start = ((q + 4) % 4) * 3;
    return range(new Date(year, start, 1), new Date(year, start + 3, 0), `le trimestre précédent`);
  }
  if (/\btrimestre\b/.test(text)) {
    return range(new Date(y, Math.floor(m / 3) * 3, 1), now, 'ce trimestre');
  }
  if (/\b(annee derniere|annee precedente)\b/.test(text)) {
    return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31), `l'année ${y - 1}`);
  }
  const month = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (month >= 0) {
    const year = Number(/\b(20\d{2})\b/.exec(text)?.[1] ?? (month > m ? y - 1 : y));
    return range(new Date(year, month, 1), new Date(year, month + 1, 0), `${MONTHS[month]} ${year}`.replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre'));
  }
  const year = /\b(20\d{2})\b/.exec(text)?.[1];
  if (year) {
    const value = Number(year);
    return range(new Date(value, 0, 1), value === y ? now : new Date(value, 11, 31), `l'année ${value}`);
  }
  if (/\b(cette annee|annee en cours|depuis janvier)\b/.test(text)) {
    return range(new Date(y, 0, 1), now, `l'année ${y}`);
  }
  return range(new Date(y, m, 1), now, `${MONTHS[m]} ${y}`.replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre'));
}

// ── Rapport d'activité ──────────────────────────────────────────────────────

@Injectable()
export class RapportActiviteSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'rapport_activite',
    label: "Rapport d'activité",
    description: 'Dossiers, audiences, facturation et diligences sur une période',
    icon: 'bar-chart',
    category: 'rapports',
    permissions: [Permission.VIEW_REPORTS],
    planModule: 'reporting',
    placeholder: 'Sur quelle période ? (ex. septembre 2026, le mois dernier, ce trimestre)',
    examples: ["Rapport d'activité du mois dernier", 'Bilan du trimestre'],
    keywords: ['rapport', 'bilan', 'activité', 'statistiques', 'tableau', 'reporting'],
    autoTriggers: ['rapport d activite', 'bilan d activite'],
  };

  constructor(private readonly reports: ReportsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const period = parsePeriod(ctx.question);
    ctx.status(`📊 Calcul du rapport (${period.label})…`);
    const report: any = await this.reports.getAdvanced(iso(period.from), iso(period.to), false, false);
    const d = report.dossiers ?? {};
    const a = report.audiences ?? {};
    const f = report.finances ?? {};
    const g = report.diligences ?? {};
    const doc = report.documents ?? {};
    const rows: Array<[string, string]> = [
      ['Dossiers ouverts', String(d.opened ?? 0)],
      ['Dossiers clôturés', String(d.closed ?? 0)],
      ['Taux de succès (dossiers jugés)', `${d.successRatePct ?? 0} %`],
      ['Audiences tenues / programmées', `${a.held ?? 0} / ${a.total ?? 0}`],
      ['Taux de renvoi', `${a.postponeRatePct ?? 0} %`],
      ['Facturé', `${money(f.billed)} (${f.invoiceCount ?? 0} facture(s))`],
      ['Encaissé', `${money(f.collected)} (recouvrement ${f.recoveryRatePct ?? 0} %)`],
      ['Reste à encaisser', money(f.unpaidTotal)],
      ['Diligences terminées / en retard', `${g.completed ?? 0} / ${g.overdue ?? 0}`],
      ['Documents reçus / à valider', `${doc.total ?? 0} / ${doc.pendingValidation ?? 0}`],
    ];
    const topClients = (f.byClient ?? []).slice(0, 5);
    const jurisdictions = (a.byJurisdiction ?? []).slice(0, 3);
    const lines = [
      `**Rapport d'activité — ${period.label}** (du ${dateFr(period.from)} au ${dateFr(period.to)})`,
      '',
      '| Indicateur | Valeur |',
      '|---|---|',
      ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    ];
    if (topClients.length) {
      lines.push('', '**Principaux clients facturés**', '', '| Client | Facturé | Factures |', '|---|---|---|',
        ...topClients.map((c: any) => `| ${cell(c.name)} | ${money(c.amount)} | ${c.invoiceCount ?? 0} |`));
    }
    if (jurisdictions.length) {
      lines.push('', `**Juridictions les plus sollicitées** : ${jurisdictions.map((j: any) => `${j.name} (${j.count})`).join(', ')}`);
    }
    const table = lines.join('\n');
    const comment = (await ctx.llm.complete(`Voici le rapport d'activité d'un cabinet d'avocats pour ${period.label}.
${table}

Écris 2 ou 3 phrases d'analyse factuelle (points forts, points de vigilance) à partir de ces chiffres uniquement, sans titre ni liste, sans recalculer d'autres chiffres.
${DRAFTING_RULES}`, 800).catch(() => '')).trim();
    const markdown = comment ? `${table}\n\n${comment}` : table;
    return {
      type: 'answer',
      markdown,
      followUps: [{
        label: 'En faire un document PDF',
        skill: 'rediger_document',
        question: "Mets ce rapport d'activité en forme de document.",
        params: {
          templateCode: 'general_courrier',
          subject: `Rapport d'activité — ${period.label}`,
          recipientName: 'Direction du cabinet',
          bodyContent: [...rows.map(([label, value]) => `${label} : ${value}`), '', comment].join('\n').trim().slice(0, 15000),
        },
      }],
    };
  }
}

// ── État des impayés ────────────────────────────────────────────────────────

@Injectable()
export class EtatImpayesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'etat_impayes',
    label: 'État des impayés',
    description: 'Factures non soldées, retards et relances à faire',
    icon: 'wallet',
    category: 'rapports',
    permissions: [Permission.VIEW_FACTURES],
    targets: ['client', 'dossier'],
    placeholder: 'Pour tout le cabinet, ou mentionnez un @client / @dossier',
    keywords: ['impayés', 'impayé', 'créances', 'retard', 'factures', 'recouvrement', 'relance'],
    autoTriggers: ['etat des impayes'],
  };

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    // « … du cabinet » sur une fiche dossier : tout le cabinet, pas la fiche ouverte.
    const target = resolveOptionalSkillTarget(ctx, this.definition.targets ?? []);
    const unpaid = await unpaidInvoices(this.dataSource, {
      ...(target?.type === 'client' && { clientId: target.id }),
      ...(target?.type === 'dossier' && { dossierId: target.id }),
    });

    const scope = target ? ` — ${target.label}` : '';
    if (!unpaid.length) return { type: 'answer', markdown: `✅ Aucune facture impayée${scope}.` };

    const total = unpaid.reduce((sum, row) => sum + row.reste, 0);
    const late = unpaid.filter((row) => row.lateDays > 0);
    const shown = unpaid.slice(0, 25);
    const lines = [
      `**État des impayés${scope}** : ${unpaid.length} facture(s), **${money(total)}** restant dû, dont ${late.length} en retard (${money(late.reduce((sum, row) => sum + row.reste, 0))}).`,
      '',
      '| Facture | Client | Dossier | Échéance | Reste dû | Retard |',
      '|---|---|---|---|---:|---:|',
      ...shown.map(({ facture, reste, due, lateDays }) =>
        `| [${cell(facture.numero)}](/facturation/factures/${facture.id}) | ${cell(customerName(facture.client))} | ${facture.dossier ? `[${cell(facture.dossier.dossier_number)}](/dossiers/${facture.dossier.id})` : '—'} | ${due ? dateFr(due) : '—'} | ${money(reste)} | ${lateDays ? `${lateDays} j` : '—'} |`),
    ];
    if (unpaid.length > shown.length) lines.push('', `… et ${unpaid.length - shown.length} autre(s) facture(s).`);

    // Relances proposées : les dossiers qui doivent le plus.
    const byDossier = new Map<number, { id: number; label: string; reste: number }>();
    for (const { facture, reste } of unpaid) {
      if (!facture.dossier) continue;
      const entry = byDossier.get(facture.dossier.id) ?? { id: facture.dossier.id, label: facture.dossier.dossier_number, reste: 0 };
      entry.reste += reste;
      byDossier.set(entry.id, entry);
    }
    const followUps: AiSkillFollowUp[] = [...byDossier.values()]
      .sort((x, y) => y.reste - x.reste)
      .slice(0, 3)
      .map((dossier) => ({
        label: `Relancer ${dossier.label}`,
        skill: 'relancer_impayes',
        question: `Relance le client pour les impayés du dossier ${dossier.label}.`,
        params: { target: { type: 'dossier', id: dossier.id, label: dossier.label } },
        reference: { type: 'dossier', id: dossier.id, label: dossier.label, href: `/dossiers/${dossier.id}` },
      }));
    // Graphique : reste dû par dossier (les 10 plus endettés).
    const chartRows = [...byDossier.values()].sort((x, y) => y.reste - x.reste).slice(0, 10);
    const chart: ChartSpec | undefined = chartRows.length >= 2
      ? {
          type: 'bar',
          title: 'Reste dû par dossier',
          xKey: 'dossier',
          xLabel: 'Dossier',
          series: [{ key: 'reste', label: 'Reste dû' }],
          data: chartRows.map((row) => ({ dossier: row.label, reste: Math.round(row.reste) })),
          unit: 'FCFA',
        }
      : undefined;
    return { type: 'answer', markdown: lines.join('\n'), followUps, ...(chart && { chart }) };
  }
}

// ── Export ZIP d'un dossier ─────────────────────────────────────────────────

@Injectable()
export class ExportDossierSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'export_dossier',
    label: 'Exporter un dossier (ZIP)',
    description: 'Documents, factures et paiements du dossier dans une archive',
    icon: 'archive',
    category: 'rapports',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Mentionnez le dossier à exporter avec @',
    keywords: ['export', 'exporter', 'zip', 'archive', 'télécharger'],
    autoTriggers: ['exporter le dossier', 'export du dossier', 'archive zip', 'zip du dossier', 'telecharger tout le dossier'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const number = info.dossier?.dossier_number ?? String(info.id);
    return {
      type: 'answer',
      markdown: `L'export du **${info.label}** rassemble ses documents, ses factures et ses paiements dans une archive ZIP (selon vos droits).`,
      download: { label: 'Télécharger le ZIP', endpoint: `exports/dossiers/${info.id}`, fileName: `dossier-${number}.zip` },
    };
  }
}

// ── Compte rendu d'audience ─────────────────────────────────────────────────

@Injectable()
export class CompteRenduAudienceSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'compte_rendu_audience',
    label: "Compte rendu d'audience",
    description: "Rédige le compte rendu destiné au client, à envoyer ou publier",
    icon: 'clipboard-list',
    category: 'rapports',
    permissions: [Permission.VIEW_AUDIENCES],
    targets: ['audience', 'dossier'],
    targetRequired: true,
    placeholder: "Mentionnez l'audience (ou le dossier) et ajoutez vos notes éventuelles",
    keywords: ['compte', 'rendu', 'audience', 'renvoi', 'décision', 'client'],
    autoTriggers: ['compte rendu d audience', 'compte rendu de l audience', 'compte rendu'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    let audienceId = target.id;
    if (target.type === 'dossier') {
      // Dernière audience passée du dossier.
      const last = await this.dataSource.getRepository(Audience)
        .createQueryBuilder('a')
        .where('a.dossier_id = :id', { id: target.id })
        .andWhere('a.audience_date <= CURDATE()')
        .orderBy('a.audience_date', 'DESC')
        .getOne();
      if (!last) return { type: 'clarify', markdown: "❓ Ce dossier n'a pas encore d'audience passée : mentionnez l'audience voulue avec @." };
      audienceId = last.id;
    }
    const info = await this.targets.load({ type: 'audience', table: 'audiences', id: audienceId, label: '' });
    const sender = await this.targets.sender(ctx.userId);
    const minutes = htmlToText(info.resource?.report_content ?? '');
    const report = minutes ? `Procès-verbal saisi :\n"""\n${minutes.slice(0, 4000)}\n"""` : '';
    const text = await ctx.llm.stream(`Tu rédiges le compte rendu d'une audience, destiné au client d'un cabinet d'avocats. Il lui sera envoyé tel quel (e-mail ou espace client).

${await this.targets.facts(info, ctx.user, ctx.question)}
${report}
${senderLine(sender, 'Rédacteur')}

Demande et notes de l'utilisateur : ${ctx.question}
${ctx.quote ? `Passage cité : ${ctx.quote.slice(0, 3000)}` : ''}

${DRAFTING_RULES}
${AUDIENCE_TRANSCRIPT_RULES}
- Commence par « Madame, Monsieur, » (ou le nom du client), structure : déroulement, décision ou renvoi, prochaines étapes pour le client.
- Le déroulement, les arguments, la décision et la date de renvoi viennent UNIQUEMENT du procès-verbal, de la transcription de l'audience, des notes ou des informations ci-dessus. Le client lit un récit synthétique : ne recopie pas la transcription mot à mot, et indique sobrement si une partie de l'enregistrement est inaudible ou manquante. Si rien ne les décrit, n'invente pas : indique la date et la juridiction de l'audience, dis que le détail des échanges et la décision seront communiqués dès que possible, et ne décris aucun débat.
- Termine par une formule de politesse puis la signature du rédacteur (nom et cabinet ; au nom du cabinet si le rédacteur n'est pas indiqué).`);
    const audienceRef = { type: 'audience', id: info.id, label: info.label };
    const date = info.resource?.audience_date ? new Date(info.resource.audience_date).toLocaleDateString('fr-FR') : '';
    return {
      type: 'answer',
      markdown: text,
      streamed: true,
      followUps: [
        {
          label: 'Envoyer au client par e-mail',
          skill: 'envoyer_email',
          question: "Envoie ce compte rendu d'audience au client.",
          params: { target: audienceRef, subject: `Compte rendu de l'audience${date ? ` du ${date}` : ''}`, body: text.slice(0, 15000) },
        },
        {
          label: "Publier dans l'espace client",
          skill: 'message_portail',
          question: "Publie ce compte rendu dans l'espace client.",
          params: { target: audienceRef, content: text.slice(0, 4000) },
        },
      ],
    };
  }
}
