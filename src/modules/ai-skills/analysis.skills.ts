// src/modules/ai-skills/analysis.skills.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import type { WriteOperation, WritePlan } from 'src/core/ai-database/dto/analysis-response.dto';
import type { AiSkillContext, AiSkillDefinition, AiSkillFollowUp, AiSkillHandler, AiSkillOutcome } from 'src/core/ai-database/skills/ai-skill.types';
import { resolveSkillTarget } from 'src/core/ai-database/skills/skill-helpers';
import { Permission } from 'src/core/enums/permission.enum';
import { Audience } from '../audiences/entities/audience.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Facture } from '../facture/entities/facture.entity';
import { fcfa } from './claim-calculator';
import { deadlineRulesPrompt, frDate, isoDate, parseIsoDate } from './legal-deadlines';
import { deadlineOperations, deadlinesMarkdown, resolveDeadlines } from './legal-tools.skills';
import {
  draftJson,
  DRAFTING_RULES,
  isOutcome,
  requestBlock,
  senderLine,
  sourceText,
  str,
  strList,
  targetOrClarify,
} from './skill-drafting';
import { customerName, SkillTargetsService, TargetInfo } from './skill-targets.service';
import { htmlHeading, htmlList, htmlTable, htmlText, inlineDraft, markdownTable } from './skill-templates';

// ── Outils communs ──────────────────────────────────────────────────────────

/** Pièces du dossier lues par le chat (les pièces confidentielles ne sont pas lues). */
async function readDossierPieces(
  ctx: AiSkillContext,
  targets: SkillTargetsService,
  info: TargetInfo,
  options: { max?: number; chars?: number } = {},
): Promise<{ pieces: Array<{ id: number; name: string; content: string }>; skipped: number }> {
  const documents = await targets.attachableDocuments(info, 40);
  const readable = documents.filter((doc: any) => !doc.is_confidential).slice(0, options.max ?? 8);
  if (readable.length) ctx.status(`📄 Lecture de ${readable.length} pièce(s) du dossier…`);
  const pieces = await ctx.readDocuments(readable.map((doc) => doc.id));
  return {
    pieces: pieces.map((piece) => ({ ...piece, content: piece.content.slice(0, options.chars ?? 6000) })),
    skipped: documents.length - readable.length,
  };
}

function piecesBlock(pieces: Array<{ name: string; content: string }>): string {
  return pieces.map((piece, i) => `Pièce ${i + 1} — « ${piece.name} » :\n"""\n${piece.content}\n"""`).join('\n\n');
}

/** Extraits de la base juridique, à citer sans inventer d'article. */
async function legalBlock(ctx: AiSkillContext, query: string): Promise<string> {
  const sources = (await ctx.legalSources(query.slice(0, 2000)).catch(() => '')).trim();
  return sources
    ? `Extraits de la base juridique de la plateforme (cite-les quand tu t'en sers ; n'invente aucun article absent de ces extraits) :\n${sources.slice(0, 9000)}`
    : "Aucun extrait de la base juridique : n'invente aucun numéro d'article ; reste sur les principes et signale ce qu'il faut vérifier.";
}

const pct = (value: unknown) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

// ── 1. Lecture d'un jugement ────────────────────────────────────────────────

@Injectable()
export class LectureJugementSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'lecture_jugement',
    label: 'Lire un jugement',
    description: 'Dispositif, condamnations et délais de recours, puis mise à jour du dossier',
    icon: 'gavel',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    placeholder: 'Joignez la décision (PDF ou photo) et mentionnez le @dossier ; précisez la date de signification si elle est connue',
    examples: ['Lis ce jugement signifié le 10/10/2026 pour @dossier'],
    keywords: ['jugement', 'décision', 'arrêt', 'ordonnance', 'dispositif', 'condamnation', 'recours', 'appel'],
    autoTriggers: ['jugement', 'arret de la cour', 'ordonnance du juge', 'dispositif de la decision', 'decision de justice'],
    autoExclude: ['injonction'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const source = sourceText(ctx);
    if (!source) {
      return { type: 'clarify', markdown: '❓ Joignez la décision (PDF, Word ou photo) ou mentionnez-la avec **@** › Documents, puis renvoyez la demande.' };
    }
    const target = resolveSkillTarget(ctx, ['dossier']);
    const info = target ? await this.targets.load(target) : null;
    ctx.status('⚖️ Lecture de la décision…');
    const draft = await draftJson<Record<string, any>>(ctx, `Tu es avocat (droit OHADA, Cameroun). Analyse cette décision de justice avec exactitude.

Règles de délais connues (code à utiliser pour les recours) :
${deadlineRulesPrompt()}

Demande de l'utilisateur : ${ctx.question}
${info ? `Dossier du cabinet : ${info.label} — client : ${customerName(info.client)}` : ''}

Décision (« ${source.name} ») :
"""
${source.text.slice(0, 30000)}
"""

${DRAFTING_RULES}
- Recopie fidèlement le dispositif (sans le réécrire) ; montants en nombres.
- "recours" : les voies de recours ouvertes contre cette décision, avec le code de règle et la date de départ (date de signification si la demande ou la décision la donne, sinon date de la décision si le délai court du prononcé, sinon vide).

Réponds UNIQUEMENT en JSON :
{"juridiction": "", "date_decision": "AAAA-MM-JJ", "nature": "contradictoire|par défaut|réputé contradictoire|inconnu", "matiere": "", "parties": "", "dispositif": "", "condamnations": [{"debiteur": "", "creancier": "", "objet": "", "montant": 0}], "issue_pour_le_client": "favorable|défavorable|partielle|inconnue", "recours": [{"regle": "", "libelle": "", "date_depart": "", "duree": 0, "unite": "jours", "franc": false, "fondement": ""}], "points_attention": [""]}`, 4000);

    const decisionDate = parseIsoDate(draft.date_decision);
    const lines = resolveDeadlines(Array.isArray(draft.recours) ? draft.recours : []);
    const condemnations = Array.isArray(draft.condamnations) ? draft.condamnations : [];
    const markdown = [
      `**${str(draft.juridiction, 200) || 'Décision'}${decisionDate ? ` — ${frDate(decisionDate)}` : ''}** (${str(draft.nature, 60) || 'nature non précisée'}${draft.matiere ? `, ${str(draft.matiere, 60)}` : ''})`,
      draft.parties ? `Parties : ${str(draft.parties, 500)}` : '',
      `Issue pour le client : **${str(draft.issue_pour_le_client, 30) || 'inconnue'}**`,
      '',
      '**Dispositif**',
      '',
      `> ${str(draft.dispositif, 4000).replace(/\n+/g, '\n> ')}`,
      '',
      condemnations.length
        ? `**Condamnations**\n\n${markdownTable(['Débiteur', 'Créancier', 'Objet', 'Montant'], condemnations.slice(0, 15).map((c: any) => [str(c.debiteur, 120), str(c.creancier, 120), str(c.objet, 200), Number(c.montant) > 0 ? fcfa(Number(c.montant)) : '—']))}`
        : '',
      '',
      lines.length ? `**Délais de recours**\n\n${deadlinesMarkdown(lines)}` : '_Aucune voie de recours identifiée : vérifiez la nature de la décision._',
      strList(draft.points_attention).length ? `\n**Points d’attention**\n${strList(draft.points_attention).map((point) => `- ${point}`).join('\n')}` : '',
    ].filter((line) => line !== '').join('\n');

    if (!info?.dossier) {
      return { type: 'answer', markdown: `${markdown}\n\nMentionnez le dossier avec **@** pour enregistrer la décision et créer les diligences de recours.` };
    }
    const fields: Record<string, any> = { final_decision: str(draft.dispositif, 4000) };
    for (const line of lines) {
      if (line.dossierField && line.deadline) fields[line.dossierField] = isoDate(line.deadline);
    }
    if (fields.appeal_deadline) fields.appeal_possibility = true;
    if (fields.cassation_deadline) fields.cassation_possibility = true;
    const operations: WriteOperation[] = [
      { operation: 'UPDATE', entity: 'dossiers', entityId: info.dossier.id, fields, humanReadable: `Enregistrer la décision sur le ${info.label}` },
      ...deadlineOperations(info.dossier.id, lines),
    ];
    const plan: WritePlan = { transaction: true, confidence: 1, humanReadable: `Enregistrer la décision et ses délais sur le ${info.label}`, operations };
    return { type: 'plan', plan, markdown };
  }
}

// ── 2. Réponse aux conclusions adverses ─────────────────────────────────────

@Injectable()
export class ReponseConclusionsSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'reponse_conclusions',
    label: 'Répondre aux conclusions adverses',
    description: 'Moyen par moyen, avec les pièces du dossier et la base juridique',
    icon: 'scale',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Joignez les conclusions adverses et indiquez votre ligne de défense',
    keywords: ['conclusions', 'réponse', 'moyens', 'adverse', 'défense', 'argumentaire', 'réplique'],
    autoTriggers: ['conclusions adverses', 'conclusions de la partie adverse', 'repondre aux conclusions', 'conclusions en reponse'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const adverse = sourceText(ctx);
    if (!adverse) {
      return { type: 'clarify', markdown: '❓ Joignez les conclusions adverses (ou mentionnez-les avec **@** › Documents), puis renvoyez la demande.' };
    }
    const info = await this.targets.load(target);
    ctx.status('🔎 Analyse des moyens adverses…');
    const analysis = await draftJson<{ moyens?: Array<Record<string, any>> }>(ctx, `Liste les moyens soulevés dans ces conclusions adverses (prétention, argument, fondement invoqué), dans leur ordre.

"""
${adverse.text.slice(0, 25000)}
"""

Réponds UNIQUEMENT en JSON : {"moyens": [{"titre": "", "resume": "", "fondement": ""}]}`, 2500);
    const moyens = (analysis.moyens ?? []).slice(0, 12);
    if (!moyens.length) return { type: 'clarify', markdown: "⚠️ Je n'ai trouvé aucun moyen dans ce document : vérifiez qu'il s'agit bien des conclusions adverses." };

    const { pieces } = await readDossierPieces(ctx, this.targets, info, { max: 6, chars: 4000 });
    const otherPieces = pieces.filter((piece) => piece.name !== adverse.name);
    const sender = await this.targets.sender(ctx.userId);
    ctx.status('✍️ Rédaction des conclusions en réponse…');
    const draft = await draftJson<Record<string, any>>(ctx, `Tu es avocat (droit OHADA, Cameroun) et rédiges des conclusions en réponse pour le client du cabinet.

${await this.targets.facts(info, ctx.user)}
${senderLine(sender, 'Avocat')}

Moyens adverses :
${moyens.map((m, i) => `${i + 1}. ${str(m.titre, 200)} — ${str(m.resume, 800)}${m.fondement ? ` (fondement : ${str(m.fondement, 200)})` : ''}`).join('\n')}

Pièces du dossier :
${piecesBlock(otherPieces) || 'aucune pièce lisible'}

${await legalBlock(ctx, moyens.map((m) => `${m.titre} ${m.fondement ?? ''}`).join(' '))}

Ligne de défense indiquée par l'utilisateur : ${ctx.question}

${DRAFTING_RULES}
- Réponds à CHAQUE moyen : réfutation, fondement, pièces du dossier à l'appui (par leur nom).
- Si un argument manque de base, dis-le plutôt que d'inventer.

Réponds UNIQUEMENT en JSON :
{"juridiction": "", "parties": "POUR : … CONTRE : …", "faits": "rappel des faits et de la procédure", "reponses": [{"moyen": "", "reponse": "", "pieces": [""]}], "par_ces_motifs": "", "a_verifier": [""]}`, 6000);

    const answers = Array.isArray(draft.reponses) ? draft.reponses : [];
    const body = [
      'I. RAPPEL DES FAITS ET DE LA PROCÉDURE', str(draft.faits),
      'II. DISCUSSION',
      ...answers.map((a: any, i: number) => `${i + 1}. Sur ${str(a.moyen, 300).replace(/^sur\s+/i, '')}\n\n${str(a.reponse)}${strList(a.pieces).length ? `\n\n(Pièces : ${strList(a.pieces).join(', ')})` : ''}`),
      'PAR CES MOTIFS', str(draft.par_ces_motifs).replace(/^par ces motifs\s*:?\s*/i, ''),
    ].filter(Boolean).join('\n\n');
    const markdown = [
      `**Conclusions en réponse — ${info.label}** (${moyens.length} moyen(s) adverse(s) traité(s))`,
      '',
      markdownTable(['Moyen adverse', 'Réponse proposée'], answers.slice(0, 12).map((a: any) => [str(a.moyen, 160), str(a.reponse, 280)])),
      strList(draft.a_verifier).length ? `\n**À vérifier avant dépôt**\n${strList(draft.a_verifier).map((item) => `- ${item}`).join('\n')}` : '',
      '\nLe projet complet est dans la carte : relisez-le, puis générez le PDF ou classez-le dans le dossier.',
    ].join('\n');
    return {
      type: 'document_draft',
      markdown,
      draft: inlineDraft({
        layout: 'skill_acte',
        name: 'Conclusions en réponse',
        title: 'Conclusions en réponse',
        info,
        sender,
        extra: { reference: info.dossier ? `Affaire ${info.dossier.case_number || info.dossier.dossier_number}` : '' },
        editable: [
          { name: 'juridiction', label: 'Juridiction', kind: 'text', value: str(draft.juridiction, 300) || String((info.dossier as any)?.jurisdiction?.name ?? info.dossier?.court_name ?? '') },
          { name: 'partiesBlock', label: 'Parties', kind: 'longtext', value: str(draft.parties, 3000) },
          { name: 'bodyContent', label: 'Conclusions', kind: 'longtext', value: body },
        ],
      }),
    };
  }
}

// ── 3. Chronologie et contradictions ────────────────────────────────────────

@Injectable()
export class ChronologieSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'chronologie',
    label: 'Chronologie et contradictions',
    description: 'Frise des faits tirée des pièces, avec les incohérences entre pièces',
    icon: 'timeline',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS, Permission.VIEW_DOCUMENTS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Mentionnez le @dossier (les pièces de sa GED et celles jointes sont lues)',
    keywords: ['chronologie', 'frise', 'faits', 'dates', 'contradictions', 'incohérences', 'timeline'],
    autoTriggers: ['chronologie', 'frise chronologique', 'contradictions entre les pieces'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const { pieces, skipped } = await readDossierPieces(ctx, this.targets, info, { max: 10, chars: 5000 });
    const attached = ctx.documents.map((doc, i) => ({ id: -i - 1, name: doc.name, content: doc.content.slice(0, 5000) }));
    const all = [...attached, ...pieces];
    const audiences = info.dossier
      ? await this.dataSource.getRepository(Audience).find({ where: { dossier_id: info.dossier.id } as any, order: { audience_date: 'ASC' } as any }).catch(() => [] as Audience[])
      : [];
    const known = [
      info.dossier?.opening_date ? `${isoDate(new Date(info.dossier.opening_date))} : ouverture du dossier au cabinet` : '',
      ...audiences.map((a) => `${isoDate(new Date(a.audience_date))} : audience${a.decision ? ` — décision : ${String(a.decision).slice(0, 200)}` : ''}${a.postponed_to ? ` — renvoyée au ${isoDate(new Date(a.postponed_to))}` : ''}`),
    ].filter(Boolean);
    if (!all.length && !known.length) {
      return { type: 'clarify', markdown: "⚠️ Aucune pièce lisible dans ce dossier : ajoutez des documents à la GED ou joignez-les, puis renvoyez la demande." };
    }
    ctx.status('🗓️ Reconstitution de la chronologie…');
    const draft = await draftJson<Record<string, any>>(ctx, `Reconstitue la chronologie des faits de ce dossier à partir des pièces, puis relève les contradictions ENTRE pièces (dates, montants, noms, versions des faits qui divergent).

Dossier : ${info.label}${info.dossier?.object ? ` — ${info.dossier.object}` : ''}
Événements enregistrés dans le logiciel :
${known.join('\n') || 'aucun'}

${piecesBlock(all)}

Demande : ${ctx.question}

Règles : chaque fait daté cite sa source (nom de la pièce). Date au format AAAA-MM-JJ, ou AAAA-MM si le jour est inconnu. N'invente rien.

Réponds UNIQUEMENT en JSON :
{"evenements": [{"date": "", "fait": "", "source": ""}], "contradictions": [{"sujet": "", "detail": "", "sources": [""]}], "lacunes": [""]}`, 5000);
    const events = (Array.isArray(draft.evenements) ? draft.evenements : [])
      .map((e: any) => ({ date: str(e.date, 10), fait: str(e.fait, 400), source: str(e.source, 120) }))
      .filter((e) => e.fait)
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const contradictions = (Array.isArray(draft.contradictions) ? draft.contradictions : [])
      .map((c: any) => ({ sujet: str(c.sujet, 160), detail: str(c.detail, 500), sources: strList(c.sources).join(', ') }))
      .filter((c) => c.sujet || c.detail);
    const showDate = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : /^\d{4}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date || 'date ?');
    const sender = await this.targets.sender(ctx.userId);
    const markdown = [
      `**Chronologie — ${info.label}** (${events.length} fait(s), ${all.length} pièce(s) lue(s)${skipped ? `, ${skipped} pièce(s) confidentielle(s) non lue(s)` : ''})`,
      '',
      markdownTable(['Date', 'Fait', 'Source'], events.slice(0, 40).map((e) => [showDate(e.date), e.fait, e.source])),
      contradictions.length ? `\n**⚠️ Contradictions relevées**\n\n${markdownTable(['Sujet', 'Détail', 'Pièces'], contradictions.map((c) => [c.sujet, c.detail, c.sources]))}` : '\nAucune contradiction relevée entre les pièces lues.',
      strList(draft.lacunes).length ? `\n**Lacunes** (périodes ou faits sans pièce)\n${strList(draft.lacunes).map((item) => `- ${item}`).join('\n')}` : '',
    ].join('\n');
    const bodyHtml = [
      htmlTable(['Date', 'Fait', 'Source'], events.map((e) => [showDate(e.date), e.fait, e.source])),
      contradictions.length ? htmlHeading('Contradictions entre pièces') + htmlTable(['Sujet', 'Détail', 'Pièces'], contradictions.map((c) => [c.sujet, c.detail, c.sources])) : '',
      strList(draft.lacunes).length ? htmlHeading('Lacunes') + htmlList(strList(draft.lacunes)) : '',
    ].join('');
    return {
      type: 'document_draft',
      markdown,
      draft: inlineDraft({ layout: 'skill_note', name: 'Chronologie du dossier', title: 'Chronologie des faits', info, sender, raw: { bodyContent: bodyHtml } }),
    };
  }
}

// ── 4. Audit et comparaison de contrats ─────────────────────────────────────

@Injectable()
export class AuditContratSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'audit_contrat',
    label: 'Auditer un contrat',
    description: 'Clauses à risque et manquantes ; avec deux versions, la comparaison commentée',
    icon: 'file-search',
    category: 'analyse',
    targets: ['dossier', 'client'],
    placeholder: 'Joignez le contrat (ou deux versions à comparer) et précisez la partie que vous défendez',
    keywords: ['contrat', 'audit', 'clauses', 'risque', 'comparer', 'versions', 'relecture', 'bail', 'vente'],
    autoTriggers: ['auditer le contrat', 'audit du contrat', 'analyser le contrat', 'relire le contrat', 'clauses du contrat', 'clauses abusives', 'clauses risquees', 'comparer les versions'],
    autoExclude: ['rediger', 'redige', 'redaction', 'convention d honoraires'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const docs = ctx.documents.filter((doc) => doc.content?.trim());
    const single = sourceText(ctx);
    if (!docs.length && !single) {
      return { type: 'clarify', markdown: '❓ Joignez le contrat (ou deux versions à comparer), ou mentionnez-le avec **@** › Documents.' };
    }
    const target = resolveSkillTarget(ctx, this.definition.targets ?? []);
    const info = target ? await this.targets.load(target) : null;
    const sender = await this.targets.sender(ctx.userId);
    const compare = docs.length >= 2;
    const contract = compare ? docs[1] : (docs[0] ?? { name: single!.name, content: single!.text });
    ctx.status(compare ? '🔀 Comparaison des deux versions…' : '🔍 Audit du contrat…');
    const legal = await legalBlock(ctx, `${contract.name} ${contract.content.slice(0, 1500)}`);
    const draft = await draftJson<Record<string, any>>(ctx, `Tu es avocat d'affaires (droit OHADA : AUDCG, AUSCGIE, sûretés ; droit camerounais). ${compare ? 'Compare les deux versions du contrat et commente juridiquement chaque changement, puis audite la version la plus récente.' : 'Audite ce contrat.'}

Partie défendue / demande : ${ctx.question}
${info ? `Client du cabinet : ${customerName(info.client)}` : ''}

${compare ? `Version initiale (« ${docs[0].name} ») :\n"""\n${docs[0].content.slice(0, 15000)}\n"""\n\nVersion modifiée (« ${docs[1].name} ») :\n"""\n${docs[1].content.slice(0, 15000)}\n"""` : `Contrat (« ${contract.name} ») :\n"""\n${contract.content.slice(0, 28000)}\n"""`}

${legal}

${DRAFTING_RULES}
- "gravite" : élevée, moyenne ou faible, du point de vue de la partie défendue.
- Clauses manquantes : seulement celles réellement utiles pour ce type de contrat.

Réponds UNIQUEMENT en JSON :
{"type_contrat": "", "synthese": "", "clauses_risque": [{"clause": "article ou intitulé", "extrait": "", "risque": "", "gravite": "", "recommandation": ""}], "clauses_manquantes": [{"clause": "", "pourquoi": ""}], "changements": [{"article": "", "avant": "", "apres": "", "portee": ""}]}`, 6000);
    const risks = (Array.isArray(draft.clauses_risque) ? draft.clauses_risque : []).map((r: any) => ({
      clause: str(r.clause, 160), risque: str(r.risque, 500), gravite: str(r.gravite, 20), recommandation: str(r.recommandation, 500),
    }));
    const order = (g: string) => (/lev/i.test(g) ? 0 : /moy/i.test(g) ? 1 : 2);
    risks.sort((a, b) => order(a.gravite) - order(b.gravite));
    const missing = (Array.isArray(draft.clauses_manquantes) ? draft.clauses_manquantes : []).map((m: any) => [str(m.clause, 160), str(m.pourquoi, 400)]);
    const changes = compare ? (Array.isArray(draft.changements) ? draft.changements : []).map((c: any) => [str(c.article, 100), str(c.avant, 300), str(c.apres, 300), str(c.portee, 400)]) : [];
    const markdown = [
      `**${compare ? 'Comparaison et audit' : 'Audit'} — ${str(draft.type_contrat, 120) || contract.name}**`,
      '',
      str(draft.synthese, 2000),
      changes.length ? `\n**Changements entre les versions**\n\n${markdownTable(['Article', 'Avant', 'Après', 'Portée'], changes)}` : '',
      risks.length ? `\n**Clauses à risque**\n\n${markdownTable(['Clause', 'Gravité', 'Risque', 'Recommandation'], risks.map((r) => [r.clause, r.gravite, r.risque, r.recommandation]))}` : '\nAucune clause à risque relevée.',
      missing.length ? `\n**Clauses manquantes**\n\n${markdownTable(['Clause', 'Pourquoi'], missing)}` : '',
    ].join('\n');
    const bodyHtml = [
      htmlText(str(draft.synthese, 4000)),
      changes.length ? htmlHeading('Changements entre les versions') + htmlTable(['Article', 'Avant', 'Après', 'Portée'], changes) : '',
      risks.length ? htmlHeading('Clauses à risque') + htmlTable(['Clause', 'Gravité', 'Risque', 'Recommandation'], risks.map((r) => [r.clause, r.gravite, r.risque, r.recommandation])) : '',
      missing.length ? htmlHeading('Clauses manquantes') + htmlTable(['Clause', 'Pourquoi'], missing) : '',
    ].join('');
    return {
      type: 'document_draft',
      markdown,
      draft: inlineDraft({ layout: 'skill_note', name: compare ? 'Comparaison de contrat' : 'Audit de contrat', title: compare ? 'Comparaison de contrat' : 'Audit de contrat', info, sender, extra: { documentSubtitle: contract.name }, raw: { bodyContent: bodyHtml } }),
    };
  }
}

// ── 7. Contrôle des mentions obligatoires d'un acte ─────────────────────────

/** Mentions exigées à peine de nullité ou d'irrecevabilité (AUPSRVE). */
export const ACT_CHECKLISTS: Record<string, { label: string; source: string; mentions: string[] }> = {
  requete_injonction_payer: {
    label: "Requête aux fins d'injonction de payer",
    source: 'AUPSRVE, art. 4',
    mentions: [
      "Noms, prénoms, profession et domicile des parties (forme, dénomination et siège social pour une personne morale)",
      'Indication précise du montant réclamé avec le décompte de ses différents éléments',
      'Fondement de la créance',
      'Documents justificatifs joints (originaux ou copies certifiées)',
      "Élection de domicile dans le ressort de la juridiction si le créancier n'y demeure pas",
    ],
  },
  signification_injonction_payer: {
    label: "Signification de l'ordonnance d'injonction de payer",
    source: 'AUPSRVE, art. 8',
    mentions: [
      "Sommation de payer le montant fixé par l'ordonnance (intérêts et frais compris) ou de former opposition",
      "Délai d'opposition (15 jours), juridiction compétente et formes de l'opposition",
      'Possibilité pour le débiteur de prendre connaissance des documents produits par le créancier',
      "Mention qu'à défaut d'opposition, l'ordonnance deviendra exécutoire",
    ],
  },
  commandement_saisie_vente: {
    label: 'Commandement de payer avant saisie-vente',
    source: 'AUPSRVE, art. 92',
    mentions: [
      'Mention du titre exécutoire en vertu duquel les poursuites sont exercées',
      'Décompte distinct des sommes réclamées en principal, frais et intérêts échus, avec le taux des intérêts',
      "Commandement de payer dans un délai de huit jours, à défaut de quoi il y sera contraint par la vente forcée de ses biens meubles",
      "Élection de domicile du créancier dans le ressort de la juridiction si nécessaire",
    ],
  },
  pv_saisie_attribution: {
    label: 'Procès-verbal de saisie-attribution',
    source: 'AUPSRVE, art. 157',
    mentions: [
      'Noms, prénoms et domiciles du débiteur et du créancier (ou dénomination et siège social)',
      'Énonciation du titre exécutoire',
      'Décompte distinct des sommes réclamées en principal, frais et intérêts échus, majoré d’une provision pour les intérêts à échoir',
      "Indication que le tiers saisi est personnellement tenu envers le créancier et qu'il lui est fait défense de disposer des sommes",
      'Reproduction du premier alinéa de l’article 156 AUPSRVE',
    ],
  },
  denonciation_saisie_attribution: {
    label: 'Dénonciation de la saisie-attribution au débiteur',
    source: 'AUPSRVE, art. 160',
    mentions: [
      'Copie du procès-verbal de saisie',
      "En caractères très apparents : les contestations doivent être soulevées, à peine d'irrecevabilité, dans le délai d'un mois",
      'Date à laquelle expire ce délai',
      'Juridiction devant laquelle les contestations peuvent être portées',
    ],
  },
};

@Injectable()
export class ControleActeSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'controle_acte',
    label: "Contrôler les mentions d'un acte",
    description: 'Mentions obligatoires présentes ou absentes, avec le risque de nullité',
    icon: 'list-checks',
    category: 'analyse',
    placeholder: "Joignez l'acte (requête, signification, commandement, PV de saisie, assignation…)",
    keywords: ['contrôle', 'mentions', 'nullité', 'acte', 'vérifier', 'assignation', 'commandement', 'signification', 'irrecevabilité'],
    autoTriggers: ['mentions obligatoires', 'controler l acte', 'controle de l acte', 'verifier l acte', 'nullite de l acte'],
  };

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const fromParams = str(ctx.params?.text, 30000);
    const source = fromParams ? { text: fromParams, name: 'projet rédigé' } : sourceText(ctx);
    if (!source) {
      return { type: 'clarify', markdown: "❓ Joignez l'acte à contrôler (ou mentionnez-le avec **@** › Documents), ou collez son texte après la consigne." };
    }
    const types = Object.entries(ACT_CHECKLISTS).map(([code, list]) => `- ${code} : ${list.label} (${list.source})`).join('\n');
    ctx.status('✅ Contrôle des mentions…');
    const typeDraft = await draftJson<{ type?: string; libelle?: string }>(ctx, `Quel est le type de cet acte ? Types connus :
${types}

Acte :
"""
${source.text.slice(0, 6000)}
"""

Réponds UNIQUEMENT en JSON : {"type": "code connu ou vide", "libelle": "nature de l'acte en clair"}`, 300);
    const known = ACT_CHECKLISTS[str(typeDraft.type, 60)];
    const reference = known
      ? `Mentions exigées (${known.source}) — vérifie CHACUNE, dans cet ordre :\n${known.mentions.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : `${await legalBlock(ctx, `${str(typeDraft.libelle, 200)} mentions obligatoires nullité`)}\nDresse la liste des mentions exigées pour ce type d'acte (droit OHADA ou camerounais) en indiquant pour chacune si elle est à vérifier.`;
    const draft = await draftJson<Record<string, any>>(ctx, `Tu contrôles la régularité formelle d'un acte de procédure (${known?.label ?? (str(typeDraft.libelle, 200) || 'acte')}).

${reference}

Acte :
"""
${source.text.slice(0, 25000)}
"""

Pour chaque mention : "presente" = oui, non ou partielle ; "extrait" = passage de l'acte qui la contient (vide si absente) ; "observation" = ce qu'il faut corriger. Ajoute dans "autres" les irrégularités visibles (date, signature, identité de l'huissier, délais erronés).

Réponds UNIQUEMENT en JSON : {"mentions": [{"mention": "", "presente": "", "extrait": "", "observation": ""}], "autres": [""], "conclusion": ""}`, 3500);
    const mentions = (Array.isArray(draft.mentions) ? draft.mentions : []).map((m: any) => ({
      mention: str(m.mention, 300), presente: str(m.presente, 20).toLowerCase(), extrait: str(m.extrait, 200), observation: str(m.observation, 400),
    }));
    const icon = (value: string) => (value.startsWith('oui') ? '✅' : value.startsWith('part') ? '🟠' : '❌');
    const missing = mentions.filter((m) => !m.presente.startsWith('oui')).length;
    const markdown = [
      `**Contrôle — ${known?.label ?? (str(typeDraft.libelle, 200) || 'acte')}**${known ? ` (${known.source})` : ' (liste établie à partir de la base juridique — à vérifier)'}`,
      '',
      markdownTable(['', 'Mention', 'Extrait', 'Observation'], mentions.map((m) => [icon(m.presente), m.mention, m.extrait || '—', m.observation || '—'])),
      strList(draft.autres).length ? `\n**Autres points**\n${strList(draft.autres).map((item) => `- ${item}`).join('\n')}` : '',
      '',
      missing ? `⚠️ **${missing} mention(s) absente(s) ou incomplète(s)** : ${str(draft.conclusion, 800) || 'risque de nullité ou d’irrecevabilité à corriger avant signification ou dépôt.'}` : `✅ ${str(draft.conclusion, 800) || 'Toutes les mentions contrôlées sont présentes.'}`,
    ].join('\n');
    return { type: 'answer', markdown };
  }
}

// ── 9. Évaluation des chances ───────────────────────────────────────────────

const DANGER_LABELS = ['Faible', 'Normal', 'Élevé', 'Critique'];

@Injectable()
export class EvaluerChancesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'evaluer_chances',
    label: 'Évaluer les chances du dossier',
    description: 'Forces, faiblesses, risques et probabilité argumentée, reportées sur le dossier',
    icon: 'target',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Mentionnez le @dossier ; ajoutez des éléments que les pièces ne disent pas',
    keywords: ['chances', 'risque', 'pronostic', 'probabilité', 'évaluation', 'analyse', 'stratégie'],
    autoTriggers: ['chances de succes', 'chances de gagner', 'nos chances', 'pronostic', 'probabilite de succes'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const { pieces } = await readDossierPieces(ctx, this.targets, info, { max: 6, chars: 4000 });
    const all = [...ctx.documents.map((doc, i) => ({ id: -i - 1, name: doc.name, content: doc.content.slice(0, 4000) })), ...pieces];
    ctx.status('🎯 Évaluation du dossier…');
    const draft = await draftJson<Record<string, any>>(ctx, `Tu es avocat expérimenté (droit OHADA, Cameroun). Évalue objectivement les chances de succès du client dans ce dossier.

${await this.targets.facts(info, ctx.user)}
${info.dossier?.description ? `Description : ${String(info.dossier.description).slice(0, 2000)}` : ''}

${piecesBlock(all) || 'Aucune pièce lisible.'}

${await legalBlock(ctx, `${info.dossier?.object ?? ''} ${info.dossier?.description ?? ''}`)}

Éléments de l'utilisateur : ${ctx.question}

${DRAFTING_RULES}
- Probabilité de 0 à 100, argumentée ; prudence si les pièces sont lacunaires.
- "niveau_danger" : 0 (faible), 1 (normal), 2 (élevé), 3 (critique) — urgence et enjeu pour le client.

Réponds UNIQUEMENT en JSON :
{"probabilite": 0, "niveau_danger": 1, "synthese": "", "forces": [""], "faiblesses": [""], "risques_procedure": [""], "pieces_manquantes": [""], "strategie": ""}`, 3500);
    const probability = pct(draft.probabilite);
    const danger = Math.max(0, Math.min(3, Math.round(Number(draft.niveau_danger)) || 1));
    const section = (title: string, items: string[]) => (items.length ? `\n**${title}**\n${items.map((item) => `- ${item}`).join('\n')}` : '');
    const notes = [
      str(draft.synthese, 2000),
      ...[['Forces', strList(draft.forces)], ['Faiblesses', strList(draft.faiblesses)], ['Risques de procédure', strList(draft.risques_procedure)], ['Pièces manquantes', strList(draft.pieces_manquantes)]]
        .filter(([, items]) => (items as string[]).length)
        .map(([title, items]) => `${title} :\n${(items as string[]).map((item) => `- ${item}`).join('\n')}`),
      draft.strategie ? `Stratégie : ${str(draft.strategie, 1500)}` : '',
    ].filter(Boolean).join('\n\n');
    const markdown = [
      `**Évaluation — ${info.label}** : probabilité de succès **${probability ?? '?'} %**, niveau d'urgence **${DANGER_LABELS[danger]}**`,
      '',
      str(draft.synthese, 2000),
      section('Forces', strList(draft.forces)),
      section('Faiblesses', strList(draft.faiblesses)),
      section('Risques de procédure', strList(draft.risques_procedure)),
      section('Pièces manquantes', strList(draft.pieces_manquantes)),
      draft.strategie ? `\n**Stratégie recommandée** : ${str(draft.strategie, 1500)}` : '',
      `\n_Estimation d'aide à la décision fondée sur ${all.length} pièce(s) : à confirmer par l'avocat en charge._`,
    ].join('\n');
    const plan: WritePlan = {
      transaction: true,
      confidence: 1,
      humanReadable: `Reporter l'analyse sur le ${info.label}`,
      operations: [{
        operation: 'UPDATE',
        entity: 'dossiers',
        entityId: info.id,
        fields: {
          ...(probability !== null && { success_probability: probability }),
          danger_level: danger,
          analysis_notes: notes.slice(0, 8000),
          analysis_date: isoDate(new Date()),
        },
        humanReadable: `Reporter l'analyse préliminaire sur le ${info.label}`,
      }],
    };
    return { type: 'plan', plan, markdown };
  }
}

// ── 10. Dossiers comparables du cabinet ─────────────────────────────────────

const STOP_WORDS = new Set(['dans', 'pour', 'avec', 'contre', 'entre', 'sans', 'sous', 'leur', 'cette', 'affaire', 'dossier', 'litige', 'societe', 'sarl']);
const keywords = (text: unknown) =>
  new Set(String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/\p{L}{4,}/gu)?.filter((word) => !STOP_WORDS.has(word)) ?? []);

/** Similarité d'un dossier avec la référence (procédure, juridiction, objet). */
export function similarity(reference: Partial<Dossier>, other: Partial<Dossier>): number {
  let score = 0;
  if (reference.procedure_type_id && reference.procedure_type_id === other.procedure_type_id) score += 3;
  if (reference.procedure_subtype_id && reference.procedure_subtype_id === other.procedure_subtype_id) score += 2;
  if (reference.jurisdiction_id && reference.jurisdiction_id === other.jurisdiction_id) score += 2;
  const a = keywords(`${reference.object ?? ''} ${reference.description ?? ''}`);
  const b = keywords(`${other.object ?? ''} ${other.description ?? ''}`);
  if (a.size && b.size) {
    const common = [...a].filter((word) => b.has(word)).length;
    score += (4 * common) / Math.min(a.size, b.size);
  }
  return Math.round(score * 100) / 100;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

@Injectable()
export class DossiersComparablesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'dossiers_comparables',
    label: 'Dossiers comparables',
    description: 'Anciens dossiers proches : issue, durée et honoraires facturés',
    icon: 'git-compare',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Mentionnez le @dossier à comparer',
    keywords: ['comparables', 'similaires', 'précédents', 'historique', 'durée', 'honoraires', 'estimation'],
    autoTriggers: ['dossiers comparables', 'dossiers similaires', 'affaires similaires', 'precedents du cabinet'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    private readonly permissions: AiDatabasePermissionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const reference = info.dossier!;
    ctx.status('🔎 Recherche des dossiers comparables…');
    const candidates = await this.dataSource.getRepository(Dossier)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.jurisdiction', 'j')
      .where('d.id != :id', { id: reference.id })
      .orderBy('d.id', 'DESC')
      .take(400)
      .getMany();
    const ranked = candidates
      .map((dossier) => ({ dossier, score: similarity(reference, dossier) }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (!ranked.length) {
      return { type: 'answer', markdown: `Aucun dossier comparable trouvé pour le **${info.label}** (même procédure, juridiction ou objet proche).` };
    }
    const canSeeFees = (await this.permissions.missingPermissions(ctx.user, [Permission.VIEW_FACTURES])).length === 0;
    const fees = new Map<number, number>();
    if (canSeeFees) {
      const rows: Array<{ dossier_id: number; total: string }> = await this.dataSource.getRepository(Facture)
        .createQueryBuilder('f')
        .select('f.dossier_id', 'dossier_id')
        .addSelect('SUM(f.montantTTC)', 'total')
        .where('f.dossier_id IN (:...ids)', { ids: ranked.map((item) => item.dossier.id) })
        .andWhere("f.status NOT IN ('0', '5')")
        .groupBy('f.dossier_id')
        .getRawMany()
        .catch(() => []);
      for (const row of rows) fees.set(Number(row.dossier_id), Number(row.total));
    }
    const duration = (d: Dossier) => (d.opening_date && d.closing_date ? Math.round((new Date(d.closing_date).getTime() - new Date(d.opening_date).getTime()) / 86_400_000) : null);
    const rows = ranked.map(({ dossier, score }) => [
      `[${dossier.dossier_number}](/dossiers/${dossier.id})`,
      String(dossier.object ?? '—').slice(0, 80),
      (dossier as any).jurisdiction?.name ?? dossier.court_name ?? '—',
      dossier.final_decision ? String(dossier.final_decision).slice(0, 90) : dossier.closing_date ? 'clôturé' : 'en cours',
      duration(dossier) !== null ? `${duration(dossier)} j` : '—',
      ...(canSeeFees ? [fees.has(dossier.id) ? fcfa(fees.get(dossier.id)!) : '—'] : []),
      score.toLocaleString('fr-FR'),
    ]);
    const durations = ranked.map(({ dossier }) => duration(dossier)).filter((value): value is number => value !== null);
    const amounts = [...fees.values()].filter((value) => value > 0);
    const fourchette = canSeeFees && amounts.length
      ? { min: Math.min(...amounts), median: median(amounts), max: Math.max(...amounts), dossiers: amounts.length }
      : null;
    const stats = [
      durations.length ? `Durée médiane des dossiers terminés : **${median(durations)} jours** (${durations.length} dossier(s)).` : '',
      fourchette ? `Honoraires facturés : de ${fcfa(fourchette.min)} à ${fcfa(fourchette.max)}, médiane **${fcfa(fourchette.median!)}**.` : '',
    ].filter(Boolean);
    const followUps: AiSkillFollowUp[] = [{
      label: "Rédiger la convention d'honoraires",
      skill: 'convention_honoraires',
      question: "Rédige la convention d'honoraires de ce dossier.",
      params: { target: { type: 'dossier', id: reference.id, label: info.label }, ...(fourchette && { fourchette }) },
    }];
    return {
      type: 'answer',
      markdown: [
        `**Dossiers comparables au ${info.label}** (procédure, juridiction et objet proches)`,
        '',
        markdownTable(['Dossier', 'Objet', 'Juridiction', 'Issue', 'Durée', ...(canSeeFees ? ['Honoraires'] : []), 'Similarité'], rows),
        '',
        ...stats,
        '\n_Indications tirées de l’historique du cabinet : chaque affaire reste particulière._',
      ].join('\n'),
      followUps,
    };
  }
}

// ── 11. Dossier de plaidoirie ───────────────────────────────────────────────

@Injectable()
export class DossierPlaidoirieSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'dossier_plaidoirie',
    label: 'Dossier de plaidoirie',
    description: 'Faits, moyens, pièces clés et questions probables du juge, prêt à imprimer',
    icon: 'presentation',
    category: 'analyse',
    permissions: [Permission.VIEW_DOSSIERS],
    targets: ['audience', 'dossier'],
    targetRequired: true,
    placeholder: "Mentionnez l'@audience (ou le dossier) ; ajoutez vos axes de plaidoirie",
    keywords: ['plaidoirie', 'plaider', 'audience', 'préparation', 'notes', 'arguments', 'juge'],
    autoTriggers: ['plaidoirie', 'dossier de plaidoirie', 'notes d audience', 'plaider'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const { pieces } = await readDossierPieces(ctx, this.targets, info, { max: 8, chars: 4000 });
    const all = [...ctx.documents.map((doc, i) => ({ id: -i - 1, name: doc.name, content: doc.content.slice(0, 4000) })), ...pieces];
    const sender = await this.targets.sender(ctx.userId);
    ctx.status('🎤 Préparation du dossier de plaidoirie…');
    const draft = await draftJson<Record<string, any>>(ctx, `Tu es avocat plaidant (droit OHADA, Cameroun). Prépare le dossier de plaidoirie de l'audience.

${await this.targets.facts(info, ctx.user)}

${piecesBlock(all) || 'Aucune pièce lisible.'}

${await legalBlock(ctx, `${info.dossier?.object ?? ''} ${ctx.question}`)}

Axes de l'utilisateur : ${ctx.question}

${DRAFTING_RULES}

Réponds UNIQUEMENT en JSON :
{"faits": "exposé bref des faits", "problematique": "", "moyens": [{"moyen": "", "fondement": "", "pieces": [""]}], "pieces_cles": [""], "questions_juge": [{"question": "", "reponse": ""}], "objections_adverses": [{"objection": "", "parade": ""}], "points_vigilance": [""], "conclusion_orale": ""}`, 5000);
    const moyens = (Array.isArray(draft.moyens) ? draft.moyens : []).map((m: any) => [str(m.moyen, 300), str(m.fondement, 300), strList(m.pieces).join(', ')]);
    const questions = (Array.isArray(draft.questions_juge) ? draft.questions_juge : []).map((q: any) => [str(q.question, 300), str(q.reponse, 500)]);
    const objections = (Array.isArray(draft.objections_adverses) ? draft.objections_adverses : []).map((o: any) => [str(o.objection, 300), str(o.parade, 500)]);
    const markdown = [
      `**Dossier de plaidoirie — ${info.label}**`,
      '',
      `**Problématique** : ${str(draft.problematique, 800)}`,
      moyens.length ? `\n**Moyens**\n\n${markdownTable(['Moyen', 'Fondement', 'Pièces'], moyens)}` : '',
      questions.length ? `\n**Questions probables du juge**\n\n${markdownTable(['Question', 'Réponse'], questions)}` : '',
      objections.length ? `\n**Objections adverses à anticiper**\n\n${markdownTable(['Objection', 'Parade'], objections)}` : '',
      strList(draft.points_vigilance).length ? `\n**Points de vigilance**\n${strList(draft.points_vigilance).map((item) => `- ${item}`).join('\n')}` : '',
    ].join('\n');
    const bodyHtml = [
      htmlHeading('Faits'), htmlText(str(draft.faits, 4000)),
      htmlHeading('Problématique'), htmlText(str(draft.problematique, 1500)),
      moyens.length ? htmlHeading('Moyens') + htmlTable(['Moyen', 'Fondement', 'Pièces'], moyens) : '',
      strList(draft.pieces_cles).length ? htmlHeading('Pièces clés') + htmlList(strList(draft.pieces_cles)) : '',
      questions.length ? htmlHeading('Questions probables du juge') + htmlTable(['Question', 'Réponse'], questions) : '',
      objections.length ? htmlHeading('Objections adverses') + htmlTable(['Objection', 'Parade'], objections) : '',
      strList(draft.points_vigilance).length ? htmlHeading('Points de vigilance') + htmlList(strList(draft.points_vigilance)) : '',
      draft.conclusion_orale ? htmlHeading('Conclusion orale') + htmlText(str(draft.conclusion_orale, 2000)) : '',
    ].join('');
    return {
      type: 'document_draft',
      markdown,
      draft: inlineDraft({ layout: 'skill_note', name: 'Dossier de plaidoirie', title: 'Dossier de plaidoirie', info, sender, raw: { bodyContent: bodyHtml } }),
    };
  }
}
