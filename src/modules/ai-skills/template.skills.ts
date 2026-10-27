// src/modules/ai-skills/template.skills.ts
import { Injectable, Optional } from '@nestjs/common';

import type {
  AiSkillContext,
  AiSkillDefinition,
  AiSkillFollowUp,
  AiSkillHandler,
  AiSkillOutcome,
  MailTemplateDraft,
} from 'src/core/ai-database/skills/ai-skill.types';
import { normalizeSkillText } from 'src/core/ai-database/skills/skill-suggestions';
import { parseLlmJson } from 'src/core/ai-database/skills/skill-helpers';
import {
  confidentMatch, designatingWords, designationPart, editsTemplate, humanVariable, mailUsage, pdfUsage, rankTemplates, readableText,
  refersToEarlierTemplate, TEMPLATE_EDIT_PATTERN, templateCitedEarlier, templateCitedIn,
} from './template-search';
import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import { PdfTemplatesService } from '../pdf-templates/pdf-templates.service';
import { MailTemplateService } from '../mail-template/mail-template.service';
import { MAIL_VARIABLE_GROUPS } from '../mail-template/mail-variables';
import { TemplateBlocksService } from '../template-blocks/template-blocks.service';
import type { TemplateBlock } from '../template-blocks/entities/template-block.entity';
import { excerpt as sourceExcerpt } from './document-studio.skills';

/**
 * Compétence « Modèles » : lister, lire, créer et modifier les modèles de
 * mails et de documents PDF, avec leurs blocs d'en-tête et de pied de page.
 * La suppression reste hors chat (comme partout dans l'assistant).
 *
 * - lister / lire : accès direct, sans appel au modèle de rédaction ;
 * - créer / modifier : les champs sont extraits de la demande en JSON, les
 *   blocs d'en-tête et de pied de page se désignent par leur code.
 */

type TemplateFamily = 'pdf' | 'mail' | 'bloc';
type TemplateAction = 'list' | 'read' | 'create' | 'update';

const FAMILY_LABEL: Record<TemplateFamily, string> = {
  pdf: 'modèle de document',
  mail: 'modèle de mail',
  bloc: 'bloc',
};

const FAMILY_PLURAL: Record<TemplateFamily, string> = {
  pdf: 'modèles de documents',
  mail: 'modèles de mails',
  bloc: 'blocs',
};

/** Pastille des boutons : mail ou document (PDF), toujours affichée. */
const FAMILY_TAG: Record<TemplateFamily, 'document' | 'mail' | 'bloc'> = { pdf: 'document', mail: 'mail', bloc: 'bloc' };

/** Nature d'un modèle dans une ligne de liste. */
const FAMILY_ROW_TAG: Record<TemplateFamily, string> = { pdf: '📄 Document (PDF)', mail: '✉️ Mail', bloc: '🧩 Bloc' };

/** Ce que l'utilisateur lit après une modification, au lieu du nom des colonnes. */
const FIELD_LABELS: Record<string, string> = {
  name: 'le nom', title: 'le titre', body_html: 'le texte', description: 'la description', subject: 'l’objet',
  is_active: 'l’activation', header_block_id: 'l’en-tête', footer_block_id: 'le pied de page', orientation: 'l’orientation',
  paper_size: 'le format du papier', font_family: 'la police', category: 'la catégorie', audience: 'les destinataires',
  variant: 'la variante', is_default: 'le choix par défaut',
};

/** Modèle ou bloc proposé au choix : nom, texte de recherche, ligne lisible. */
interface CatalogEntry {
  family: TemplateFamily;
  code: string;
  name: string;
  description: string | null;
  usage: string;
  item: any;
}

/** À quoi sert le modèle, en clair (jamais de code ni de variable). */
function usageOf(family: TemplateFamily, item: any): string {
  if (family === 'pdf') return `pour ${pdfUsage(item.entity_type)}`;
  if (family === 'mail') return mailUsage(item.category, item.audience);
  return item.kind === 'footer' ? 'pied de page' : item.kind === 'header' ? 'en-tête' : '';
}

const VIEW_CODES: Record<TemplateFamily, string> = {
  pdf: 'view_pdf_templates',
  mail: 'view_mail_templates',
  bloc: 'view_pdf_templates',
};

const CREATE_CODES: Record<TemplateFamily, string> = {
  pdf: 'create_pdf_template',
  mail: 'create_mail_template',
  bloc: 'create_pdf_template',
};

const EDIT_CODES: Record<TemplateFamily, string> = {
  pdf: 'edit_pdf_template',
  mail: 'edit_mail_template',
  bloc: 'edit_pdf_template',
};

const norm = (text: unknown): string => normalizeSkillText(String(text ?? ''));

function detectFamily(question: string, params: Record<string, any>): TemplateFamily | 'all' | null {
  const fromParams = String(params.family ?? '').toLowerCase();
  if (fromParams === 'pdf' || fromParams === 'mail' || fromParams === 'bloc') return fromParams;
  const text = norm(question);
  const mail = /mail|e-mail|courriel/.test(text);
  const bloc = /bloc|en.tete|entete|pied de page|header|footer/.test(text);
  const pdf = /pdf|document|facture|dossier|attestation|convocation|courrier|contrat/.test(text);
  const found = (mail ? ['mail'] : []).concat(bloc ? ['bloc'] : [], pdf ? ['pdf'] : []);
  if (params.family === 'all') return 'all';
  if (found.length === 1) return found[0] as TemplateFamily;
  if (found.length > 1) return 'all';
  return null;
}

function explicitAction(question: string): TemplateAction | null {
  const text = norm(question);
  if (!text) return null;
  // Créer ou modifier : le verbe qui vient le premier l'emporte. « Modifier le
  // modèle X ajoute une phrase » est une modification (« ajoute » y est la consigne).
  // « Ajoute une clause au modèle de bail » : une modification du modèle, pas une création.
  const create = editsTemplate(text)
    ? text.search(/cree|creer|nouveau|nouvelle|redige/)
    : text.search(/cree|creer|nouveau|nouvelle|ajoute(\s+un)?|redige/);
  const update = text.search(/modifi|corrige|change|mets? a jour|actualise|renomme|desactive|reactive|refai|refaire|reecri|remplace|ameliore|personnalis/);
  if (create >= 0 && (update < 0 || create < update)) return 'create';
  if (update >= 0 || editsTemplate(text)) return 'update';
  if (/liste|lister|quels\b|quelles\b|tous les|toutes les/.test(text)) return 'list';
  // Chercher un modèle par son nom (« cherche le modèle facture client », « y a-t-il un
  // modèle de convocation ? ») : le plus proche est montré, sinon les modèles voisins.
  if (/lis|voir|vois|affiche|montre|detail|contenu|ouvre|quel est|cherche|trouve|consulte|y a t il|existe t il|avons nous|avez vous/.test(text)) return 'read';
  return null;
}

/**
 * Action voulue. Une précision (« liste d'abord les modèles », « montre-le »)
 * ne remplace celle de la demande initiale que pour consulter : « ajoute le
 * logo » en réponse à « modifie le mail d'activation » reste une modification.
 */
function detectAction(request: SplitRequest, params: Record<string, any>): TemplateAction {
  const fromParams = String(params.action ?? '').toLowerCase();
  if (fromParams === 'list' || fromParams === 'read' || fromParams === 'create' || fromParams === 'update') {
    return fromParams;
  }
  const precision = norm(request.precision);
  if (/\b(?:liste|lister|listes)\b/.test(precision)) return 'list';
  if (/^(?:lis|lire|montre|affiche|ouvre|voir|vois)\b/.test(precision)) return 'read';
  return explicitAction(request.base) ?? explicitAction(request.precision) ?? 'list';
}

/**
 * Demande reprise après une précision (voir handleSkillStream) :
 * « <demande initiale>\nPrécision apportée : <réponse> ».
 */
interface SplitRequest {
  base: string;
  precision: string;
}

function splitRequest(question: string): SplitRequest {
  const [base, ...rest] = String(question ?? '').split(/\n\s*Précision apportée\s*:\s*/);
  return { base: base.trim(), precision: rest.join(' ').trim() };
}

/** Code entre « », "..." ou code brut (lettres, chiffres, tirets, soulignés). */
function extractCode(question: string, params: Record<string, any>): string | null {
  if (typeof params.code === 'string' && params.code.trim()) return params.code.trim();
  const quoted = /[«"]([^»"]+)[»"]/.exec(String(params.prefill ?? question)) ?? /[«"]([^»"]+)[»"]/.exec(question);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  // Mots composés courants (« e-mail », « en-tête ») : jamais des codes.
  const tokens = [...question.matchAll(/\b([a-z][a-z0-9]*(?:[_-][a-z0-9]+)+)\b/gi)]
    .map((match) => match[1])
    .filter((token) => !/^(?:e-mails?|en-t[eê]tes?|peut-[eê]tre|c-[aà]-d)$/i.test(token))
    // « montre-moi », « ouvre-le » : un verbe et son pronom, pas un code.
    .filter((token) => !/^[a-zà-ÿ]+-(?:moi|nous|vous|toi|le|la|les|lui|leur|en|y)$/i.test(token));
  return tokens.find((token) => token.includes('_')) ?? tokens[0] ?? null;
}

/** Score de ressemblance nom/code contre la demande (mots porteurs). */
function scoreMatch(candidate: { code?: string; name?: string }, text: string): number {
  const words = new Set(norm(text).split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  if (!words.size) return 0;
  const haystack = norm(`${candidate.code ?? ''} ${candidate.name ?? ''}`);
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += word.length >= 6 ? 2 : 1;
  }
  return score;
}

/**
 * Mots de la demande qui ne désignent ni le modèle ni le changement voulu
 * (« je veux modifier le mail d'… ») : écartés pour retrouver un modèle par
 * son nom et pour savoir si la demande dit quoi changer.
 */
const UPDATE_FILLER = new Set([
  'veux', 'voudrais', 'voudrait', 'aimerais', 'souhaite', 'souhaiterais', 'peux', 'pouvez', 'merci', 'stp', 'svp',
  'modifier', 'modifie', 'modifiez', 'changer', 'change', 'changez', 'personnaliser', 'personnalise',
  'corriger', 'corrige', 'mettre', 'mets', 'jour', 'actualiser', 'actualise', 'editer', 'edite',
  'modele', 'modeles', 'template', 'templates', 'mail', 'mails', 'email', 'emails', 'courriel', 'courriels',
  'message', 'texte', 'pour', 'dans', 'avec', 'cette', 'celui',
  // « un modèle de document » désigne la famille, pas un modèle précis.
  'document', 'documents',
]);

/**
 * La version renvoyée par la carte (`revise`) est celle du modèle visé :
 * `draftCode` (code de la carte) ou `code` (code changé dans la carte).
 */
function revisesTarget(revise: any, targetCode: string): boolean {
  const codes = [revise?.draftCode, revise?.code].filter((code) => typeof code === 'string' && code.trim());
  return !codes.length || codes.some((code) => norm(code) === norm(targetCode));
}

/** Verbes d'activation (texte normalisé) : « désactive-le », « réactiver ». Pas « mail d'activation ». */
const ACTIVATION_VERBS = /\b(?:des|re)?activ(?:e|er|ez|es)\b/g;

/** Activation demandée : false pour « désactive », true pour « (ré)active », null sinon. */
function activationAsked(question: string): boolean | null {
  const text = norm(question);
  if (/\bdesactiv(?:e|er|ez|es)\b/.test(text)) return false;
  if (/\b(?:re)?activ(?:e|er|ez|es)\b/.test(text)) return true;
  return null;
}

/** Variables des modèles de mails (catalogue de l'éditeur), pour la rédaction. */
function mailVariableCatalog(): string {
  return MAIL_VARIABLE_GROUPS
    .flatMap((group) => group.variables.map((variable) => `{{${variable.key}}} (${variable.label})`))
    .join(', ');
}

/** Liste JSON des variables déclarées d'un modèle (`["firstName", …]`). */
function parseVariableList(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Variables {{…}} d'un contenu (sans doublon). */
function templateVariables(html: unknown): string[] {
  return [...new Set([...String(html ?? '').matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]))];
}

/** Mots porteurs de la demande, hors formules et verbes de modification. */
function designationWords(question: string): string[] {
  return norm(question).split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !UPDATE_FILLER.has(word));
}

/**
 * Champs que le chat a le droit d'écrire : tout le reste (code à la
 * modification, tenant_id, id, is_system…) est ignoré pour ne jamais
 * déclencher un doublon sur l'index unique (tenant, code).
 */
const EDITABLE: Record<TemplateFamily, ReadonlySet<string>> = {
  pdf: new Set(['name', 'variant', 'description', 'title', 'body_html', 'variables', 'orientation', 'paper_size', 'font_family', 'header_block_id', 'footer_block_id', 'layout_options', 'is_active']),
  mail: new Set(['name', 'category', 'audience', 'description', 'subject', 'body_html', 'variables', 'font_family', 'header_block_id', 'footer_block_id', 'is_active']),
  bloc: new Set(['name', 'description', 'body_html', 'variables', 'is_default', 'is_active']),
};

const CREATABLE: Record<TemplateFamily, ReadonlySet<string>> = {
  pdf: new Set([...EDITABLE.pdf, 'code', 'entity_type']),
  mail: new Set([...EDITABLE.mail, 'code']),
  bloc: new Set([...EDITABLE.bloc, 'code', 'channel', 'kind']),
};

const excerpt = (html: unknown, max = 600): string => {
  const text = String(html ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** Fichiers joints à la demande (texte lu), à suivre pour rédiger ou retoucher le modèle. */
function attachmentsBlock(ctx: AiSkillContext): string {
  const files = (ctx.documents ?? []).filter((doc) => doc.content?.trim()).slice(0, 4);
  if (!files.length) return '';
  const each = Math.floor(12000 / files.length);
  return `\n- Fichiers joints par l'utilisateur : sers-t'en comme source (texte, clauses, mise en forme à reprendre) selon la demande ; remplace les données propres à un client ou un dossier par les variables {{…}} du modèle.${files
    .map((doc) => `\nFichier « ${doc.name} » :\n"""\n${sourceExcerpt(doc.content, ctx.question, each)}\n"""`)
    .join('')}`;
}

/** Fichiers joints lus, dits dans la réponse (« 📎 Fichiers utilisés : … »). */
function filesNote(ctx: AiSkillContext): string {
  const names = (ctx.documents ?? []).filter((doc) => doc.content?.trim()).slice(0, 4).map((doc) => `« ${doc.name} »`);
  return names.length ? `\n\n📎 Fichiers utilisés : ${names.join(', ')}.` : '';
}

const rowLabel =(family: TemplateFamily, item: { name: string; is_active?: boolean }): string => {
  const usage = usageOf(family, item);
  return `${FAMILY_ROW_TAG[family]} · **${item.name}**${usage ? ` — ${usage}` : ''}${item.is_active === false ? ' (désactivé)' : ''}`;
};

@Injectable()
export class ModelesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'modeles',
    label: 'Modèles (mails et PDF)',
    description: 'Gérer les modèles eux-mêmes : lister, lire, modifier, renommer, activer les modèles de mails et de documents, leurs en-têtes et pieds de page ; créer un modèle de mail (ne produit aucun document)',
    icon: 'file-plus',
    category: 'documents',
    placeholder: 'Que faire ? (ex. liste les modèles de mails, lis le modèle facture_standard, crée un modèle de relance, modifie l’objet de dossier_created_client)',
    examples: [
      'Liste les modèles de documents PDF',
      'Montre le modèle de mail dossier_created_client',
      'Crée un modèle de mail de relance pour les factures impayées',
      'Modifie le pied de page PDF : ajoute le numéro RCCM',
    ],
    keywords: [
      'modèle', 'modele', 'modèles', 'template', 'gabarit',
      'mail', 'e-mail', 'courriel', 'pdf', 'document',
      'en-tête', 'entete', 'pied de page', 'header', 'footer', 'bloc',
      'lister', 'lire', 'créer', 'modifier',
    ],
    autoTriggers: [
      // Formes explicites (motifs notés /…/) : score maximal, sans ambiguïté.
      // Seuls les motifs et expressions multi-mots comptent : « modèle » seul
      // est un mot vide du détecteur, un déclencheur « modèle de X » retomberait
      // sur X seul et volerait les autres compétences.
      '/\\bliste(?:r)? (?:les |des |tous les |toutes les )?(?:modeles?|blocs?)\\b/',
      // « montre-moi le modèle », « cherche le modèle facture client », « trouve un modèle de facture ».
      '/\\b(?:lis|lire|lisez|voir|vois|montre|montrer|affiche|afficher|ouvre|ouvrir|cherche|chercher|recherche|rechercher|trouve|trouver|retrouve|retrouver|consulte|consulter)(?: moi| nous)? (?:le |la |les |un |une |des |ce |cette |mon |ma |mes |nos )?(?:modele|bloc|template|gabarit)/',
      // « Quels modèles de facture avons-nous ? », « y a-t-il un modèle de convocation ? ».
      '/\\b(?:quels?|quelles?) (?:sont )?(?:les |nos |vos |mes )?(?:modeles?|templates?|gabarits?|blocs?)\\b/',
      '/\\b(?:y a t il|existe t il|avons nous|avez vous|as tu|a t on|on a|ai je) (?:deja )?(?:un |une |des |le |les )?(?:modeles?|templates?|gabarits?)\\b/',
      // « je veux modifier un modèle de document » : l'article indéfini compte aussi.
      // Renommer, désactiver, réactiver un modèle : modifications aussi (sinon l'écriture
      // générique cherchait « Audience — Compte-rendu » au hasard dans les tables).
      '/\\b(?:modifi|chang|corrig|personnalis|edit|ameliore|renomm|desactiv|reactiv|activ)\\w* (?:le |la |les |l |un |une |des |ce |cet |cette |mon |ma |mes |du )?(?:modele|bloc)/',
      // « modifie le pied de page PDF : ajoute le RCCM » : un bloc, pas une écriture générique.
      '/\\b(?:modifi|chang|corrig|personnalis|edit|ameliore|refai|mets? a jour|mettre a jour)\\w* (?:le |la |l |un |une |ce |cet |cette |mon |ma |du )?(?:pied de page|pieds de page|en tete|entete)/',
      // « ajoute une clause au modèle de bail », « renomme le modèle de lettre » : le modèle lui-même.
      TEMPLATE_EDIT_PATTERN,
      '/\\bcree(?:r|z)? un modele de (?:mail|courriel|e mail)/',
      '/\\bcree(?:r|z)? un bloc/',
      // E-mail automatique désigné par son rôle (« modifier le mail d'activation de compte ») :
      // c'est son modèle qu'on veut changer, pas un e-mail à envoyer.
      '/\\b(?:(?:modifi|chang|personnalis|corrig|edit)\\w*|mets? a jour|mettre a jour) (?:le |la |les |l )?(?:texte (?:du |des )?)?(?:mails?|e mails?|emails?|courriels?) (?:d |de |du |des )?(?:activation|ouverture|reinitialisation|bienvenue|identifiants|code de verification|mot de passe|connexion)/',
      'liste des modèles', 'liste les modèles', 'lister les modèles', 'liste des blocs',
      'créer un modèle de mail', 'modèle pdf', 'modèles pdf', 'modele pdf',
      'en-tête', 'entete', 'pied de page',
    ],
    autoExclude: [
      'rédige', 'rédiger', 'traduis',
      // Un document à produire (« un contrat », « le courrier du dossier ») n'est pas
      // un modèle ; « le modèle de contrat de bail » en est un : l'exclusion ne joue
      // que hors de « modèle(s) de … ».
      '/(?<!\\bmodeles? (?:de |d |du |des |pour )(?:\\w+ ){0,3})\\b(?:contrat|courrier|mise en demeure|attestation|convocation|bail|proces verbal)\\b/',
    ],
    // La compétence répond elle-même aux consultations qui la désignent
    // (« liste les modèles de mails ») au lieu de la lecture générique.
    autoLaunchOnConsultation: true,
  };

  constructor(
    private readonly pdf: PdfTemplatesService,
    private readonly mails: MailTemplateService,
    private readonly blocks: TemplateBlocksService,
    @Optional() private readonly permissions?: AiDatabasePermissionService,
  ) {}

  private async missing(ctx: AiSkillContext, codes: string[]): Promise<string[]> {
    if (!this.permissions) return [];
    return this.permissions.missingPermissions(ctx.user, codes).catch(() => codes);
  }

  private clarify(text: string, followUps: AiSkillFollowUp[] = []): AiSkillOutcome {
    return { type: 'clarify', markdown: text, followUps };
  }

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const params = ctx.params ?? {};
    const request = splitRequest(ctx.question);
    // La précision désigne en priorité le modèle (« account_activation »).
    const code = extractCode(request.precision, params) ?? extractCode(request.base, params);
    let family = detectFamily(request.base, params) ?? detectFamily(request.precision, params);
    // Un code connu tranche (« dossier_created_client » contient « dossier », lu comme PDF).
    if (code && family !== 'mail' && family !== 'pdf' && family !== 'bloc') family = (await this.familyOfCode(code)) ?? family;
    // Retouche d'une carte de modèle : sa famille (mail par défaut, y compris un modèle pas encore créé).
    if (params.revise && typeof params.revise === 'object') {
      const reviseFamily = String(params.revise.family ?? '');
      if (reviseFamily === 'mail' || reviseFamily === 'pdf' || reviseFamily === 'bloc') family = reviseFamily;
      else if (family !== 'pdf' && family !== 'bloc') family = 'mail';
    }
    const action = detectAction(request, params);
    // Lire ou modifier un modèle nommé sans dire son type : son nom le retrouve dans toutes les familles.
    if (!family && (action === 'read' || action === 'update')) family = 'all';

    if (!family) {
      return this.clarify(
        'S’agit-il d’un **modèle de mail**, d’un **modèle PDF** ou d’un **bloc** (en-tête / pied de page) ?',
        [
          { label: 'Modèles de mails', skill: 'modeles', question: `${ctx.question} (modèles de mails)`, params: { ...params, family: 'mail' } },
          { label: 'Modèles PDF', skill: 'modeles', question: `${ctx.question} (modèles PDF)`, params: { ...params, family: 'pdf' } },
          { label: 'Blocs', skill: 'modeles', question: `${ctx.question} (blocs)`, params: { ...params, family: 'bloc' } },
        ],
      );
    }

    if (action === 'list') {
      const listed = await this.list(ctx, family);
      // « Liste d'abord les modèles » en réponse à « modifie le mail… » : la
      // modification reste en attente du code choisi dans la liste.
      const intended = explicitAction(request.base);
      if (request.precision && listed.type === 'answer' && (intended === 'update' || intended === 'read')) {
        return { type: 'clarify', markdown: listed.markdown, followUps: listed.followUps, pendingQuestion: request.base };
      }
      return listed;
    }
    if (action === 'read') return this.read(ctx, family, params, code);
    if (action === 'create') return this.create(ctx, family, params, request);
    return this.update(ctx, family, params, request, code);
  }

  /** Famille d'un code connu (« modifie account_activation » sans dire « mail »). */
  private async familyOfCode(code: string): Promise<TemplateFamily | null> {
    for (const family of ['mail', 'pdf', 'bloc'] as TemplateFamily[]) {
      if (await this.findByCode(family, code).catch(() => null)) return family;
    }
    return null;
  }

  // ── Lister ────────────────────────────────────────────────────────────────

  private async list(ctx: AiSkillContext, family: TemplateFamily | 'all'): Promise<AiSkillOutcome> {
    const families: TemplateFamily[] = family === 'all' ? ['pdf', 'mail', 'bloc'] : [family];
    const denied = await this.missing(ctx, families.map((item) => VIEW_CODES[item]));
    if (denied.length) {
      return this.clarify(`⚠️ Lister ces modèles demande le droit « ${denied[0]} ».`);
    }
    ctx.status('Lecture des modèles…');
    const sections: string[] = [];
    for (const item of families) {
      const rows = await this.allOf(item);
      const lines = rows.map((row) => `- ${rowLabel(item, row)}`).join('\n');
      sections.push(`### ${FAMILY_PLURAL[item].charAt(0).toUpperCase()}${FAMILY_PLURAL[item].slice(1)} (${rows.length})\n\n${lines || '_Aucun_'}`);
    }
    return {
      type: 'answer',
      markdown: `${sections.join('\n\n')}\n\nDites-moi le **nom** d’un modèle pour le **lire** ou le **modifier** (la suppression se fait dans **Plus > Configuration > Modèles**).`,
      followUps: [
        { label: 'Lire un modèle', skill: 'modeles', question: 'lis le modèle ', params: { action: 'read' } },
        { label: 'Créer un modèle', skill: 'modeles', question: 'crée un modèle ', params: { action: 'create' } },
      ],
    };
  }

  // ── Lire ──────────────────────────────────────────────────────────────────

  private async read(
    ctx: AiSkillContext,
    family: TemplateFamily | 'all',
    params: Record<string, any>,
    wanted: string | null,
  ): Promise<AiSkillOutcome> {
    const families: TemplateFamily[] = family === 'all' ? ['pdf', 'mail', 'bloc'] : [family];
    const denied = await this.missing(ctx, families.map((item) => VIEW_CODES[item]));
    if (denied.length) {
      return this.clarify(`⚠️ Lire ces modèles demande le droit « ${denied[0]} ».`);
    }
    const catalog = await this.catalogOf(families);
    if (!catalog.length) return { type: 'answer', markdown: 'Aucun modèle dans le cabinet pour l’instant.' };
    // Le nom suffit (le code reste accepté) ; la précision donnée après une question l'emporte.
    const request = splitRequest(ctx.question);
    const query = designationPart(request.precision || request.base);
    const hit = confidentMatch(catalog, query, wanted)
      ?? (await this.matchElsewhere(ctx, families, query, wanted, VIEW_CODES))
      ?? this.fromHistory(ctx, catalog, query, wanted);
    if (hit) return this.describe(hit.family, hit.item);
    return this.chooseTemplate('read', families, catalog, `${query} ${wanted ?? ''}`, request.base);
  }

  /**
   * Famille devinée sur un mot du nom (« convocation » lu comme document) : le
   * modèle nommé est cherché aussi dans les autres familles autorisées.
   */
  private async matchElsewhere(
    ctx: AiSkillContext,
    families: TemplateFamily[],
    query: string,
    wanted: string | null,
    rights: Record<TemplateFamily, string>,
  ): Promise<CatalogEntry | null> {
    const others: TemplateFamily[] = [];
    for (const family of (['pdf', 'mail', 'bloc'] as TemplateFamily[]).filter((item) => !families.includes(item))) {
      if (!(await this.missing(ctx, [rights[family]])).length) others.push(family);
    }
    if (!others.length) return null;
    return confidentMatch(await this.catalogOf(others), query, wanted);
  }

  /** Modèles et blocs des familles données, avec ce qu'il faut pour les retrouver par leur nom. */
  private async catalogOf(families: TemplateFamily[]): Promise<CatalogEntry[]> {
    const catalog: CatalogEntry[] = [];
    for (const family of families) {
      for (const row of await this.allOf(family).catch(() => [] as any[])) {
        catalog.push({
          family,
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          usage: usageOf(family, row),
          item: row,
        });
      }
    }
    return catalog;
  }

  /**
   * Aucun modèle ne ressort nettement : jamais de choix au hasard. Les plus
   * proches sont proposés (par leur nom), avec de quoi en choisir un autre.
   */
  private chooseTemplate(
    action: 'read' | 'update',
    families: TemplateFamily[],
    catalog: CatalogEntry[],
    query: string,
    pendingQuestion?: string,
  ): AiSkillOutcome {
    const matches = rankTemplates(catalog, query).slice(0, 6);
    const ranked = matches.map((match) => match.entry);
    const near = ranked.length > 0;
    const shown = near ? ranked : catalog.slice(0, 6);
    const verb = action === 'read' ? 'lire' : 'modifier';
    const asked = designatingWords(query).join(' ');
    const several = matches.filter((match) => match.coverage >= 1).length > 1;
    const intro = several
      ? `Plusieurs modèles correspondent à « ${asked} » : choisissez celui à ${verb}.`
      : near
      ? `Je n’ai pas trouvé de modèle qui porte exactement ce nom${asked ? ` (« ${asked} »)` : ''}. Voici ceux qui s’en rapprochent : choisissez celui à ${verb}.`
      : asked
        ? `Aucun modèle ne ressemble à « ${asked} ». Voici quelques modèles du cabinet : choisissez celui à ${verb}.`
        : `Quel modèle voulez-vous ${verb} ? Choisissez-en un.`;
    return {
      type: 'clarify',
      markdown: `${intro}\n\nAucun ne convient ? Tapez le nom du modèle voulu, ou ouvrez la liste complète.`,
      ...(pendingQuestion && { pendingQuestion }),
      followUps: [
        ...shown.map((entry): AiSkillFollowUp => ({
          label: entry.name,
          skill: 'modeles',
          question: `${action === 'read' ? 'Lire' : 'Modifier'} le modèle « ${entry.name} »`,
          params: { action, family: entry.family, code: entry.code },
          badge: FAMILY_TAG[entry.family],
        })),
        {
          label: 'Voir tous les modèles',
          skill: 'modeles',
          question: 'liste les modèles',
          params: { action: 'list', family: families.length === 1 ? families[0] : 'all' },
        },
      ],
    };
  }

  /** Un modèle présenté en clair : à quoi il sert et ce qu'il dit, sans code ni variable. */
  private describe(family: TemplateFamily, item: any): AiSkillOutcome {
    const usage = usageOf(family, item);
    const what = family === 'pdf'
      ? `Modèle de document ${usage}`
      : family === 'mail'
        ? `Modèle de mail${usage ? ` (${usage})` : ''}`
        : `Bloc ${item.kind === 'footer' ? 'de pied de page' : item.kind === 'header' ? 'd’en-tête' : ''}`.trim();
    const body = readableText(item.body_html, 700);
    const lines = [
      `## ${item.name}`,
      '',
      what,
      item.description ? String(item.description) : '',
      family === 'pdf' && item.title ? `**Titre du document :** ${readableText(item.title, 200)}` : '',
      family === 'mail' && item.subject ? `**Objet du mail :** ${readableText(item.subject, 200)}` : '',
      `**État :** ${item.is_active === false ? 'désactivé' : 'actif'}`,
      '',
      body ? '**Ce que dit le modèle :**' : '',
      ...body.split('\n').filter(Boolean).map((line) => `> ${line}`),
      body ? '\n_Les passages entre crochets (ex. [nom du client]) sont remplis automatiquement._' : '',
    ].filter((line, index, all) => line !== '' || all[index - 1] !== '');
    return {
      type: 'answer',
      markdown: lines.join('\n').trim(),
      followUps: [
        // Modèle de document : s'en servir est la suite la plus courante.
        ...(family === 'pdf' && item.id
          ? [{
              label: 'Générer le document depuis ce modèle',
              skill: 'rediger_document',
              question: `Rédige un document à partir du modèle « ${item.name} »`,
              params: { templateId: item.id },
              badge: 'document' as const,
            }]
          : []),
        {
          label: 'Modifier ce modèle',
          skill: 'modeles',
          question: `Modifier le modèle « ${item.name} »`,
          params: { action: 'update', family, code: item.code },
          badge: FAMILY_TAG[family],
        },
        { label: 'Choisir un autre modèle', skill: 'modeles', question: 'liste les modèles', params: { action: 'list', family } },
      ],
    };
  }

  /**
   * « Montre ce modèle », « modifie le même modèle » : le modèle cité plus tôt
   * dans la conversation, quand la demande ne le nomme pas elle-même.
   */
  private fromHistory(ctx: AiSkillContext, catalog: CatalogEntry[], query: string, wanted: string | null): CatalogEntry | null {
    // Un code connu a déjà été retrouvé ; un code inconnu ne désigne rien.
    if (!refersToEarlierTemplate(ctx.question) || (wanted && catalog.some((entry) => norm(entry.code) === norm(wanted)))) return null;
    if (designatingWords(query).length && templateCitedIn(catalog, query).cited) return null;
    return templateCitedEarlier(catalog, ctx.history) ?? null;
  }

  // ── Créer / modifier ──────────────────────────────────────────────────────

  private async create(
    ctx: AiSkillContext,
    family: TemplateFamily | 'all',
    params: Record<string, any>,
    request: SplitRequest,
  ): Promise<AiSkillOutcome> {
    if (family === 'all') {
      return this.clarify(
        'Créer quoi : un **modèle de mail**, un **modèle PDF** ou un **bloc** ?',
        (['mail', 'pdf', 'bloc'] as TemplateFamily[]).map((item) => ({
          label: FAMILY_LABEL[item],
          skill: 'modeles',
          question: `${ctx.question} (${FAMILY_LABEL[item]})`,
          params: { ...params, family: item },
        })),
      );
    }
    const denied = await this.missing(ctx, [CREATE_CODES[family]]);
    if (denied.length) {
      return this.clarify(`⚠️ Créer ${FAMILY_LABEL[family] === 'bloc' ? 'un bloc' : `un ${FAMILY_LABEL[family]}`} demande le droit « ${denied[0]} ».`);
    }
    if (family === 'mail') return this.createMailDraft(ctx, params, request);
    // Un modèle de document se crée dans le studio (aperçu A4, éditeur, pièces jointes) :
    // un seul parcours, quelle que soit la compétence qui a reçu la demande.
    if (family === 'pdf' && !params.body_html) return { type: 'handoff', skill: 'rediger_document', params: { createTemplate: true } };
    const known = this.knownFields(family, params);
    const absent = this.requiredFields(family).filter((field) => !known[field]);
    let draft = known;
    if (absent.length) {
      if (!this.hasSubstance(ctx.question)) {
        return this.clarify(
          `Pour créer ${FAMILY_LABEL[family] === 'bloc' ? 'le bloc' : `le ${FAMILY_LABEL[family]}`} il manque : **${absent.join(', ')}**. Précisez-les (le code doit être unique, en minuscules avec des soulignés).`,
        );
      }
      const generated = await this.draftFields(ctx, family, null);
      if (!generated) {
        return this.clarify('Je n’ai pas pu déduire les champs du modèle. Précisez au moins le code, le nom et le contenu.');
      }
      draft = { ...generated, ...known };
      const stillAbsent = this.requiredFields(family).filter((field) => !draft[field]);
      if (stillAbsent.length) {
        return this.clarify(`Il manque encore : **${stillAbsent.join(', ')}**.`);
      }
    }
    try {
      const created = await this.persistCreate(family, draft);
      return {
        type: 'answer',
        markdown: `✅ ${FAMILY_LABEL[family] === 'bloc' ? 'Bloc' : 'Modèle'} créé : **${created.name}** (\`${created.code}\`).${this.headerFooterNote(created)}`,
        followUps: [
          { label: `Lire ${created.code}`, skill: 'modeles', question: `lis le modèle ${created.code}`, params: { action: 'read', family, code: created.code } },
          { label: 'Lister les modèles', skill: 'modeles', question: 'liste les modèles', params: { action: 'list' } },
        ],
      };
    } catch (error) {
      return this.clarify(`❌ Création impossible : ${(error as Error).message}`);
    }
  }

  private async update(
    ctx: AiSkillContext,
    family: TemplateFamily | 'all',
    params: Record<string, any>,
    request: SplitRequest,
    wanted: string | null,
  ): Promise<AiSkillOutcome> {
    // Le nom suffit (le code reste accepté) ; la précision donnée après une question l'emporte.
    const query = designationPart(request.precision || request.base);
    let target: any = null;
    if (family === 'all') {
      // Famille non précisée : le nom du modèle la donne, sinon on la demande.
      const catalog = await this.catalogOf(['pdf', 'mail', 'bloc']);
      const hit = confidentMatch(catalog, query, wanted) ?? this.fromHistory(ctx, catalog, query, wanted);
      if (!hit) {
        if (designatingWords(query).length || wanted) return this.chooseTemplate('update', ['pdf', 'mail', 'bloc'], catalog, `${query} ${wanted ?? ''}`, request.base);
        return this.clarify(
          'Quel type de modèle voulez-vous modifier : un **modèle de mail**, un **modèle de document** ou un **bloc** (en-tête, pied de page) ?',
          (['mail', 'pdf', 'bloc'] as TemplateFamily[]).map((item) => ({
            label: FAMILY_LABEL[item],
            skill: 'modeles',
            question: `${ctx.question} (${FAMILY_LABEL[item]})`,
            params: { ...params, family: item },
          })),
        );
      }
      family = hit.family;
      target = hit.item;
    }
    const asked = `${request.base}\n${request.precision}`;
    // Un code donné est cherché tel quel ; sinon le nom, même approximatif.
    if (!target && wanted) target = await this.findByCode(family, wanted);
    if (!target) {
      const catalog = await this.catalogOf([family]);
      const hit = confidentMatch(catalog, query, wanted)
        ?? (await this.matchElsewhere(ctx, [family], query, wanted, EDIT_CODES))
        ?? this.fromHistory(ctx, catalog, query, wanted);
      // Rien de net : jamais de choix au hasard, on propose les modèles les plus proches.
      if (!hit) return this.chooseTemplate('update', [family], catalog, `${query} ${wanted ?? ''}`, request.base || undefined);
      family = hit.family;
      target = hit.item;
    }
    const denied = await this.missing(ctx, [EDIT_CODES[family]]);
    if (denied.length) {
      return this.clarify(`⚠️ Modifier ${FAMILY_LABEL[family] === 'bloc' ? 'un bloc' : `un ${FAMILY_LABEL[family]}`} demande le droit « ${denied[0]} ».`);
    }
    // Réponse suivante de l'utilisateur : reprise sur ce modèle, plus sur la demande initiale.
    const pendingQuestion = `modifie le ${FAMILY_LABEL[family]} ${target.code}`;
    // Version enregistrée ; « Demander » sur la carte renvoie la version affichée
    // (`revise`), que l'IA retouche à la place, avec les changements déjà proposés.
    const stored = target;
    const revise = params.revise && typeof params.revise === 'object' && revisesTarget(params.revise, target.code)
      ? params.revise
      : null;
    const proposed: Record<string, any> = revise?.changes && typeof revise.changes === 'object' ? { ...revise.changes } : {};
    if (revise) {
      const text = (key: string): string | undefined => (typeof revise[key] === 'string' ? revise[key] : undefined);
      target = {
        ...target,
        name: text('name') || target.name,
        subject: text('subject') ?? target.subject,
        title: text('title') ?? target.title,
        body_html: text('body_html') ?? target.body_html,
      };
    }
    const known = this.knownFields(family, params, true);
    let changes = known;
    // « désactive / réactive le modèle X » : l'activation se lit dans la demande,
    // sans rédaction par l'IA (qui ne la renvoyait pas toujours).
    const activation = activationAsked(asked);
    if (activation !== null && !Object.keys(changes).length
      && !(await this.asksChange(norm(asked).replace(ACTIVATION_VERBS, ' '), family, target))) {
      if (Boolean(stored.is_active ?? true) === activation) {
        return {
          type: 'clarify',
          markdown: `**${stored.name}** est déjà ${activation ? 'actif' : 'désactivé'} : rien à changer.`,
          pendingQuestion,
        };
      }
      changes = { is_active: activation };
    }
    if (!Object.keys(changes).length) {
      if (!(await this.asksChange(asked, family, target))) {
        // La demande désigne le modèle sans dire quoi changer : la carte le montre
        // (aperçu + éditeur) et la prochaine réponse (« refais le design ») s'applique à lui.
        return {
          type: 'clarify',
          markdown: `Que voulez-vous changer dans **${target.name}** ? Dites-le simplement (${
            family === 'mail' ? 'l’objet, le texte, la mise en forme…' : family === 'pdf' ? 'le titre, le texte, la mise en page…' : 'le texte, la mise en forme…'
          }), ou modifiez-le directement dans la carte ci-dessous.`,
          pendingQuestion,
          templateDraft: await this.editDraft(family, stored, target, proposed),
        };
      }
      const generated = await this.draftFields(ctx, family, target);
      if (!generated || !Object.keys(generated).length) {
        return {
          type: 'clarify',
          markdown: `Je n’ai pas compris quoi changer dans **${target.name}**. Dites-le simplement (ex. « change le titre en … », « remplace le texte par … », « refais la mise en page »).`,
          pendingQuestion,
          templateDraft: await this.editDraft(family, stored, target, proposed),
        };
      }
      changes = activation === null ? generated : { ...generated, is_active: activation };
      // Un lien du modèle ({{activationUrl}}, {{resetUrl}}…) perdu à la réécriture
      // rendrait l'e-mail inutilisable : la nouvelle version n'est pas proposée.
      const lostLinks = typeof changes.body_html === 'string'
        ? templateVariables(target.body_html).filter((name) => /url|link|lien/i.test(name) && !templateVariables(changes.body_html).includes(name))
        : [];
      if (lostLinks.length) {
        return {
          type: 'clarify',
          markdown: `⚠️ La nouvelle version retirait ${lostLinks.map((name) => `« ${humanVariable(name)} »`).join(', ')} (un lien indispensable du mail) : je ne l’ai pas retenue. Reformulez la demande ou modifiez le modèle dans la carte.`,
          pendingQuestion,
          templateDraft: await this.editDraft(family, stored, target, proposed),
        };
      }
    }
    const dropped = typeof changes.body_html === 'string'
      ? templateVariables(target.body_html).filter((name) => !templateVariables(changes.body_html).includes(name))
      : [];
    // Toute modification (texte, nom, activation, mise en page…) est proposée dans
    // une carte (aperçu + éditeur), enregistrée seulement quand l'utilisateur valide.
    // La compétence reste en attente : « plus court », « change la couleur »…
    // retouchent la version affichée dans la carte (voir `revise`).
    const version = { ...target };
    for (const key of ['name', 'subject', 'title', 'body_html']) {
      if (typeof changes[key] === 'string' && changes[key].trim()) version[key] = changes[key];
    }
    const others = Object.fromEntries(Object.entries(changes).filter(([key]) => !['name', 'subject', 'title', 'body_html'].includes(key)));
    const templateDraft = await this.editDraft(family, stored, version, { ...proposed, ...others });
    const what = [
      ...(version.name !== target.name ? [`nom : « ${version.name} »`] : []),
      ...(family === 'mail' && version.subject !== target.subject ? ['l’objet'] : []),
      ...(family === 'pdf' && version.title !== target.title ? ['le titre'] : []),
      ...(version.body_html !== target.body_html ? ['le texte'] : []),
      ...(templateDraft.changeLabels ?? []),
    ];
    return {
      type: 'clarify',
      pendingQuestion,
      markdown: `✏️ Nouvelle version de **${stored.name}**${what.length ? ` (${what.join(', ')})` : ''} : vérifiez l’aperçu, retouchez-la dans la carte ou dites ce qu’il faut changer, puis **Enregistrer le modèle**. Rien n’est enregistré avant.${
        dropped.length ? `\n\nℹ️ Ne figurent plus dans le texte : ${dropped.map((name) => `[${humanVariable(name)}]`).join(', ')}.` : ''
      }${filesNote(ctx)}`,
      templateDraft,
    };
  }

  /**
   * Nouveau modèle de mail : rédigé par l'IA puis proposé dans la carte, créé
   * seulement par « Créer le modèle ». `revise` (version affichée dans la
   * carte) est retouché selon la consigne au lieu d'être réécrit.
   */
  private async createMailDraft(
    ctx: AiSkillContext,
    params: Record<string, any>,
    request: SplitRequest,
  ): Promise<AiSkillOutcome> {
    const revise = params.revise && typeof params.revise === 'object' ? params.revise : null;
    let draft: Record<string, any>;
    if (revise) {
      draft = {
        code: revise.code, name: revise.name, subject: revise.subject, body_html: revise.body_html,
        category: revise.category, audience: revise.audience, description: revise.description,
        header_block_id: revise.header_block_id, footer_block_id: revise.footer_block_id,
      };
      const instruction = request.precision || request.base;
      const naming = new Set(norm(`${draft.code ?? ''} ${draft.name ?? ''}`).split(/[^a-z0-9]+/));
      const asks = designationWords(instruction).some((word) => !naming.has(word) && !/^(?:cree|creer|creez|nouveau|nouvelle)$/.test(word));
      if (asks) {
        const changes = await this.draftFields({ ...ctx, question: instruction }, 'mail', draft);
        if (!changes || !Object.keys(changes).length) {
          return {
            type: 'clarify',
            markdown: 'Je n’ai pas compris quoi changer. Dites-le en clair (ex. « mets l’objet à … », « ajoute un paragraphe sur … », « rends le bouton vert »).',
            pendingQuestion: `crée le modèle de mail ${draft.code}`,
            templateDraft: await this.newMailDraft(draft),
          };
        }
        for (const key of ['name', 'subject', 'body_html', 'category', 'audience', 'description', 'header_block_id', 'footer_block_id']) {
          if (changes[key] !== undefined) draft[key] = changes[key];
        }
      }
    } else {
      const known = this.knownFields('mail', params);
      draft = known;
      const absent = this.requiredFields('mail').filter((field) => !known[field]);
      if (absent.length) {
        if (!this.hasSubstance(ctx.question)) {
          return this.clarify('Quel modèle de mail créer ? Décrivez-le (ex. « mail au client pour lui annoncer une nouvelle diligence »).');
        }
        const generated = await this.draftFields(ctx, 'mail', null);
        if (!generated) {
          return this.clarify('Je n’ai pas pu rédiger le modèle. Décrivez-le autrement (destinataire, objet, ce que le mail doit dire).');
        }
        draft = { ...generated, ...known };
      }
      draft.code = await this.uniqueMailCode(this.slug(draft.code) || this.slug(draft.name) || 'modele_mail');
    }
    // Déjà créé depuis la carte : la retouche devient une modification du modèle.
    const existing = revise ? await this.findByCode('mail', String(draft.code ?? '')) : null;
    if (existing) {
      return {
        type: 'clarify',
        pendingQuestion: `modifie le modèle de mail ${existing.code}`,
        markdown: `✏️ Nouvelle version de **${existing.name}** (\`${existing.code}\`) : vérifiez l’aperçu, puis **Enregistrer le modèle**. Rien n’est enregistré avant.`,
        templateDraft: await this.editDraft('mail', existing, { ...existing, subject: draft.subject, body_html: draft.body_html }),
      };
    }
    const templateDraft = await this.newMailDraft(draft);
    return {
      type: 'clarify',
      pendingQuestion: `crée le modèle de mail ${templateDraft.code}`,
      markdown: `✏️ Nouveau modèle de mail **${templateDraft.name}** (\`${templateDraft.code}\`) : vérifiez l’aperçu, retouchez-le dans la carte ou dites ce qu’il faut changer, puis **Créer le modèle**. Rien n’est enregistré avant.${filesNote(ctx)}`,
      templateDraft,
    };
  }

  /** Carte d'un modèle de mail à créer (blocs inconnus : blocs par défaut). */
  private async newMailDraft(draft: Record<string, any>): Promise<MailTemplateDraft> {
    const subject = String(draft.subject ?? '');
    const body = String(draft.body_html ?? '');
    return {
      mode: 'create',
      id: null,
      code: this.slug(draft.code) || 'modele_mail',
      name: String(draft.name ?? '').trim() || 'Nouveau modèle',
      category: ['auth', 'dossier', 'audience', 'billing', 'general'].includes(draft.category) ? draft.category : 'general',
      audience: ['client', 'collaborator', 'both'].includes(draft.audience) ? draft.audience : 'client',
      ...(draft.description && { description: String(draft.description) }),
      subject,
      body_html: body,
      original: { subject: '', body_html: '' },
      header_block_id: (await this.resolveBlockId(draft.header_block_id)) ?? null,
      footer_block_id: (await this.resolveBlockId(draft.footer_block_id)) ?? null,
      font_family: null,
      variables: [...new Set([...templateVariables(body), ...templateVariables(subject)])],
    };
  }

  /** Code libre : suffixe _2, _3… si un modèle porte déjà ce code. */
  private async uniqueMailCode(code: string): Promise<string> {
    for (let index = 1; index < 50; index += 1) {
      const candidate = index === 1 ? code : `${code}_${index}`;
      if (!(await this.findByCode('mail', candidate))) return candidate;
    }
    return `${code}_${Date.now()}`;
  }

  /**
   * Carte d'édition d'un modèle existant : version proposée (`version` : nom,
   * objet, titre, corps), version enregistrée (`stored`) et autres champs
   * changés (`extra` : activation, mise en page, blocs…), enregistrés avec la carte.
   */
  private async editDraft(
    family: TemplateFamily,
    stored: any,
    version: any,
    extra: Record<string, any> = {},
  ): Promise<MailTemplateDraft> {
    const changes = await this.sanitize(family, extra, EDITABLE[family]);
    for (const key of ['name', 'subject', 'title', 'body_html', 'variables']) delete changes[key];
    for (const [key, value] of Object.entries(changes)) {
      // Colonnes booléennes lues en 0 / 1 : comparées en booléen.
      if (value === stored[key] || (typeof value === 'boolean' && value === Boolean(stored[key]))) delete changes[key];
    }
    const changeLabels = await this.changeLabels(changes);
    return {
      family,
      mode: 'update',
      id: stored.id,
      code: stored.code,
      name: String(version.name || stored.name),
      subject: family === 'mail' ? String(version.subject ?? '') : '',
      ...(family === 'pdf' && {
        title: String(version.title ?? ''),
        orientation: String(changes.orientation ?? stored.orientation ?? 'portrait'),
        paper_size: String(changes.paper_size ?? stored.paper_size ?? 'a4'),
      }),
      ...(family === 'bloc' && { channel: stored.channel, kind: stored.kind }),
      body_html: String(version.body_html ?? ''),
      original: {
        subject: family === 'mail' ? stored.subject ?? '' : '',
        body_html: stored.body_html ?? '',
        name: stored.name ?? '',
        ...(family === 'pdf' && { title: stored.title ?? '' }),
      },
      header_block_id: changes.header_block_id ?? stored.header_block_id ?? null,
      footer_block_id: changes.footer_block_id ?? stored.footer_block_id ?? null,
      font_family: changes.font_family ?? stored.font_family ?? null,
      ...(family === 'pdf' && { layout_options: changes.layout_options ?? stored.layout_options ?? null }),
      ...(Object.keys(changes).length > 0 && { changes, changeLabels }),
      variables: [...new Set([
        ...templateVariables(stored.body_html),
        ...templateVariables(stored.subject),
        ...parseVariableList(stored.variables),
      ])],
    };
  }

  /** Autres changements en clair (« orientation : paysage », « désactivé »). */
  private async changeLabels(changes: Record<string, any>): Promise<string[]> {
    const labels: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'is_active') labels.push(value ? 'réactivé' : 'désactivé');
      else if (key === 'is_default') labels.push(value ? 'bloc par défaut' : 'plus bloc par défaut');
      else if (key === 'orientation') labels.push(`orientation : ${value === 'landscape' ? 'paysage' : 'portrait'}`);
      else if (key === 'paper_size') labels.push(`format : ${String(value).toUpperCase()}`);
      else if (key === 'header_block_id' || key === 'footer_block_id') {
        const block = Number(value) === 0 ? null : await this.blockName(Number(value)).catch(() => null);
        labels.push(`${FIELD_LABELS[key]} : ${Number(value) === 0 ? 'aucun' : block?.name ?? 'bloc par défaut'}`);
      } else if (key === 'description') labels.push('la description');
      else if (FIELD_LABELS[key]) labels.push(`${FIELD_LABELS[key]} : ${String(value)}`);
    }
    return labels;
  }

  // ── Accès services ────────────────────────────────────────────────────────

  private allOf(family: TemplateFamily): Promise<any[]> {
    if (family === 'pdf') return this.pdf.findAll();
    if (family === 'mail') return this.mails.findAll();
    return this.blocks.findAll();
  }

  private async findByCode(family: TemplateFamily, code: string): Promise<any | null> {
    const wanted = norm(code);
    if (family === 'pdf') return this.pdf.findByCode(code).catch(() => null);
    if (family === 'mail') return this.mails.findByCode(code).catch(() => null);
    const direct = await this.blocks.findByCode(code).catch(() => null);
    if (direct) return direct;
    let rows: TemplateBlock[] = [];
    try {
      rows = await this.blocks.findAll();
    } catch {
      rows = [];
    }
    return rows.find((row) => norm(row.code) === wanted) ?? null;
  }

  /** Codes des blocs actifs du canal (mail ou PDF) : seuls citables par le modèle de langue. */
  private async blockCodes(family: TemplateFamily): Promise<string[]> {
    if (family === 'bloc') return [];
    const channel = family === 'mail' ? 'mail' : 'pdf';
    const rows = await this.blocks.findAll().catch(() => [] as TemplateBlock[]);
    return rows.filter((row) => row.channel === channel && row.is_active !== false).map((row) => row.code);
  }

  private async blockName(id: number): Promise<{ code: string; name: string } | null> {
    const block = await this.blocks.findOne(Number(id));
    return block ? { code: block.code, name: block.name } : null;
  }

  private async resolveBlockId(codeOrId: unknown): Promise<number | undefined> {
    if (codeOrId === undefined || codeOrId === null || String(codeOrId).trim() === '') return undefined;
    // 0 = aucun en-tête / pied de page (null = bloc par défaut du cabinet).
    if (codeOrId === false || /^(?:aucun|aucune|none|sans|false)$/i.test(String(codeOrId).trim())) return 0;
    if (/^\d+$/.test(String(codeOrId).trim())) return Number(codeOrId);
    // Bloc inconnu (code inventé par le modèle de langue) : bloc par défaut, sans échec.
    const block = await this.blocks.findByCode(String(codeOrId).trim()).catch(() => null);
    return block?.id;
  }

  private requiredFields(family: TemplateFamily): string[] {
    if (family === 'bloc') return ['code', 'name', 'channel', 'kind', 'body_html'];
    if (family === 'mail') return ['code', 'name', 'subject', 'body_html'];
    return ['code', 'name', 'entity_type', 'body_html'];
  }

  /** Champs déjà fournis (boutons, préremplissage) : jamais le LLM. */
  private knownFields(family: TemplateFamily, params: Record<string, any>, isUpdate = false): Record<string, any> {
    const pick = (...keys: string[]): any => {
      for (const key of keys) {
        const value = params[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return undefined;
    };
    const out: Record<string, any> = {};
    const assign = (key: string, value: any): void => {
      if (value !== undefined) out[key] = value;
    };
    if (!isUpdate) {
      assign('code', this.slug(pick('code')));
      assign('name', pick('name', 'nom', 'titre') ?? (family === 'pdf' ? pick('title') : undefined));
    } else {
      assign('name', pick('name', 'nom'));
    }
    if (family === 'mail') {
      assign('subject', pick('subject', 'objet', 'object'));
      assign('category', pick('category', 'categorie'));
      assign('audience', pick('audience', 'destinataire'));
    }
    if (family === 'pdf') {
      if (!isUpdate) assign('entity_type', pick('entity_type', 'type', 'cible'));
      assign('variant', pick('variant', 'variante'));
      assign('title', pick('title', 'titre'));
      assign('orientation', pick('orientation'));
      assign('paper_size', pick('paper_size', 'format'));
    }
    if (family === 'bloc') {
      if (!isUpdate) {
        assign('channel', pick('channel', 'canal'));
        assign('kind', pick('kind', 'nature'));
      }
      assign('is_default', pick('is_default', 'defaut', 'par_defaut'));
    }
    assign('description', pick('description'));
    assign('body_html', pick('body_html', 'body', 'corps', 'contenu', 'html'));
    assign('variables', pick('variables'));
    assign('header_block_id', pick('header_block_id', 'header_block', 'en_tete', 'entete'));
    assign('footer_block_id', pick('footer_block_id', 'footer_block', 'pied_de_page'));
    assign('font_family', pick('font_family', 'police'));
    assign('is_active', pick('is_active', 'actif'));
    if (typeof out.is_default === 'string') out.is_default = /^(1|true|oui|yes)$/i.test(out.is_default.trim());
    if (typeof out.is_active === 'string') out.is_active = /^(1|true|oui|yes)$/i.test(out.is_active.trim());
    return out;
  }

  private slug(code: unknown): string | undefined {
    if (typeof code !== 'string' || !code.trim()) return undefined;
    return norm(code).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || undefined;
  }

  private hasSubstance(question: string): boolean {
    return norm(question).split(/[^a-z0-9]+/).filter((word) => word.length > 3).length > 2;
  }

  /**
   * La demande dit quoi changer : il reste des mots une fois écartés ceux qui
   * nomment un modèle (« activation de compte » désignait un modèle, même si
   * un code en précision en a choisi un autre).
   */
  private async asksChange(question: string, family: TemplateFamily, target: { code?: string; name?: string }): Promise<boolean> {
    const catalog = [target, ...(await this.allOf(family).catch(() => [] as any[]))];
    const naming = new Set(catalog.flatMap((item) => norm(`${item.code ?? ''} ${item.name ?? ''}`).split(/[^a-z0-9]+/)));
    return designationWords(question).some((word) => !naming.has(word));
  }

  private headerFooterNote(item: any): string {
    if (item.header_block_id === undefined && item.footer_block_id === undefined) return '';
    return ' (en-tête et pied : blocs par défaut sauf mention contraire)';
  }

  /** Champs JSON déduits de la demande (création complète ou modifications). */
  private async draftFields(
    ctx: AiSkillContext,
    family: TemplateFamily,
    target: any | null,
  ): Promise<Record<string, any> | null> {
    const shape =
      family === 'bloc'
        ? '{code, name, channel ("mail"|"pdf"), kind ("header"|"footer"), body_html (HTML complet avec {{variables}}), description?, variables? (liste JSON en chaîne), is_default?}'
        : family === 'mail'
          ? '{code, name, subject, body_html (HTML complet avec {{variables}}), category? ("auth"|"dossier"|"audience"|"billing"|"general"), audience? ("client"|"collaborator"|"both"), header_block? (code de bloc), footer_block? (code de bloc), variables? (liste JSON en chaîne)}'
          : '{code, name, entity_type ("facture"|"dossier"|"client"|"audience"|"diligence"|"general"), variant? ("standard"|"comptable"|"client"|"interne"), title?, body_html (HTML complet avec {{variables}}), header_block? (code de bloc), footer_block? (code de bloc), variables? (liste JSON en chaîne)}';
    const keepRules = target
      ? [
          `- Garde toutes les variables {{…}} du modèle actuel (${templateVariables(target.body_html).map((name) => `{{${name}}}`).join(', ') || 'aucune'}) : surtout les liens (boutons), sans quoi l'e-mail ne sert plus.`,
          family === 'mail'
            ? "- Refaire le design ou le contenu : renvoie un body_html complet, en HTML d'e-mail (styles en ligne, tableaux ou blocs simples, bouton = lien <a> stylé avec {{brandColor}} si disponible), sans <html>, <head> ni <style>."
            : '- Refaire le design ou le contenu : renvoie un body_html complet avec des styles en ligne.',
          "- Le body_html actuel est complet ci-dessous : ne renvoie que les champs qui changent.",
        ].join('\n')
      : family === 'mail'
        ? `- body_html : HTML d'e-mail soigné (styles en ligne, blocs simples, bouton = lien <a> stylé avec {{brandColor}}), sans <html>, <head> ni <style>.\n- Variables disponibles (n'en invente pas d'autres) : ${mailVariableCatalog()}.`
        : '';
    const blocks = await this.blockCodes(family);
    const blockRule = family === 'bloc'
      ? ''
      : blocks.length
        ? `\n- header_block / footer_block : uniquement parmi ${blocks.join(', ')}, ou "aucun" si l'utilisateur veut retirer l'en-tête / le pied de page ; sinon omets-les (bloc par défaut).`
        : '\n- Omets header_block et footer_block (bloc par défaut du cabinet), sauf "aucun" si l\'utilisateur veut retirer l\'en-tête / le pied de page.';
    const files = attachmentsBlock(ctx);
    const prompt = target
      ? `Modifications demandées : « ${ctx.question} »\nModèle actuel (${target.code}) : ${JSON.stringify({ name: target.name, subject: target.subject, title: target.title, body_html: excerpt(target.body_html, 6000) })}.\n${keepRules}${blockRule}${files}\nRéponds UNIQUEMENT avec un objet JSON des seuls champs à changer parmi ${shape}. Clés snake_case, sans commentaire.`
      : `Demande : « ${ctx.question} »\n${keepRules}${blockRule}${files}\nRéponds UNIQUEMENT avec un objet JSON ${shape}. Clés snake_case, sans commentaire. Code en minuscules avec soulignés.`;
    try {
      const parsed = parseLlmJson<Record<string, any>>(await ctx.llm.complete(prompt, files ? 6000 : 4000));
      if (!parsed || typeof parsed !== 'object') return null;
      const out: Record<string, any> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined || value === null || String(value).trim() === '') continue;
        if (key === 'header_block' || key === 'header_block_code') out.header_block_id = value;
        else if (key === 'footer_block' || key === 'footer_block_code') out.footer_block_id = value;
        else out[key] = value;
      }
      if (typeof out.code === 'string') out.code = this.slug(out.code);
      return out;
    } catch {
      return null;
    }
  }

  /** Ne garde que les champs écrivables (+ blocs résolus en id). */
  private async sanitize(
    family: TemplateFamily,
    source: Record<string, any>,
    allowed: ReadonlySet<string>,
  ): Promise<Record<string, any>> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && allowed.has(key) && key !== 'header_block_id' && key !== 'footer_block_id') {
        // « false » renvoyé en texte par le modèle de langue : jamais un « oui ».
        out[key] = (key === 'is_active' || key === 'is_default') && typeof value === 'string'
          ? /^(1|true|oui|yes)$/i.test(value.trim())
          : value;
      }
    }
    const header_block_id = await this.resolveBlockId(source.header_block_id);
    const footer_block_id = await this.resolveBlockId(source.footer_block_id);
    if (header_block_id !== undefined) out.header_block_id = header_block_id;
    if (footer_block_id !== undefined) out.footer_block_id = footer_block_id;
    return out;
  }

  private async persistCreate(family: TemplateFamily, draft: Record<string, any>): Promise<any> {
    // Champs requis vérifiés par l'appelant ; le DTO reste typé côté service.
    const dto = await this.sanitize(family, draft, CREATABLE[family]);
    if (family === 'pdf') return this.pdf.create({ entity_type: 'general', ...dto } as any);
    if (family === 'mail') return this.mails.create(dto as any);
    return this.blocks.create(dto as any);
  }
}

