// src/core/ai-database/skills/ai-skill.types.ts
import type { ReferencedEntityContext } from '../dto/ask-question.dto';
import type { WritePlan } from '../dto/analysis-response.dto';
import type { ChartSpec } from '../chart-spec';

/**
 * Compétence du chat (« # » dans la saisie) : une action spécialisée choisie
 * explicitement par l'utilisateur. Elle ne passe pas par la détection
 * d'intention : son handler résout la cible (mentions @ ou page courante),
 * rédige ce qu'il faut, puis renvoie toujours un résultat à valider. Rien ne
 * part sans clic de l'utilisateur.
 */

export type AiSkillCategory = 'communication' | 'documents' | 'analyse' | 'actes' | 'facturation' | 'rapports' | 'agenda';

/** Ordre des familles dans le menu « Compétences ». */
export const AI_SKILL_CATEGORIES: Array<{ code: AiSkillCategory; label: string }> = [
  { code: 'communication', label: 'Communication' },
  { code: 'documents', label: 'Documents' },
  { code: 'analyse', label: 'Analyse juridique' },
  { code: 'actes', label: 'Calculs & actes' },
  { code: 'facturation', label: 'Facturation' },
  { code: 'rapports', label: 'Rapports & exports' },
  { code: 'agenda', label: 'Agenda & tâches' },
];

/** Type de mention (`@`) qu'une compétence sait viser. */
export type AiSkillTargetType =
  | 'client'
  | 'dossier'
  | 'audience'
  | 'facture'
  | 'employee'
  | 'diligence'
  | 'document';

export interface AiSkillDefinition {
  /** Identifiant envoyé par le chat (`skill=envoyer_email`). */
  code: string;
  label: string;
  /** Une ligne, affichée dans le menu. */
  description: string;
  /** Nom d'icône du chat (mail, message-circle, file-text…). */
  icon: string;
  category: AiSkillCategory;
  /** Permissions toutes exigées, celles du bouton manuel équivalent. */
  permissions?: string[];
  /** Module du plan d'abonnement requis (ex. « reporting »). */
  planModule?: 'payroll' | 'expenses' | 'invoicing' | 'reporting';
  /** Mentions attendues, par ordre de préférence. */
  targets?: AiSkillTargetType[];
  /** La cible est-elle indispensable (sinon la compétence demande la mention) ? */
  targetRequired?: boolean;
  /** Texte d'aide de la zone de saisie une fois la compétence choisie. */
  placeholder: string;
  examples?: string[];
  /** Mots recherchés par le filtre du menu (« mail », « courriel »…). */
  keywords?: string[];
  /**
   * Mode auto : expressions qui désignent cette compétence sans ambiguïté
   * (« whatsapp », « mise en demeure »). Avec un verbe d'action dans la
   * demande (« prépare », « rédige », « calcule »…), la compétence est lancée
   * directement. Sans déclencheur, elle n'est jamais devinée (écritures
   * guidées, envois de factures : le parcours normal s'en charge).
   */
  autoTriggers?: string[];
  /** Mots qui écartent la détection automatique (« facture » pour l'e-mail libre). */
  autoExclude?: string[];
  /**
   * Anciens codes fusionnés dans cette compétence (absents du menu) : boutons,
   * messages et actions enregistrés avec eux restent valides ; `params`
   * préremplit la demande (« courrier » → modèle general_courrier).
   */
  /**
   * Consultation auto-lançable : la compétence sait répondre elle-même aux
   * questions de consultation qui la désignent sans ambiguïté (« liste les
   * modèles de mails ») au lieu de laisser la lecture générique répondre.
   */
  autoLaunchOnConsultation?: boolean;
  aliases?: Array<{ code: string; params?: Record<string, unknown> }>;
}

/** Bouton proposé sous une réponse : relance une autre compétence. */
export interface AiSkillFollowUp {
  label: string;
  skill: string;
  question: string;
  params?: Record<string, any>;
  /** Mention à joindre (cible déjà connue). */
  reference?: { type: string; id: number | string; label: string; href?: string };
  /** Nature de ce que le bouton désigne (modèle de mail, de document, bloc), affichée en pastille. */
  badge?: 'mail' | 'document' | 'bloc';
}

/** Courrier / attestation… prêt à être rendu en PDF par le chat. */
export interface DocumentDraft {
  templateId: number;
  templateCode: string;
  templateName: string;
  /** Type d'entité du modèle (facture, dossier, client, audience, diligence, general). */
  entityType: string;
  /** Enregistrement dont le chat charge les données (absent pour un modèle général). */
  entityId?: number | string;
  /** Dossier où classer le PDF généré. */
  dossierId?: number;
  dossierLabel?: string;
  fileName: string;
  /** Variables du modèle remplies par l'IA (subject, bodyContent…). */
  variables: Record<string, string>;
  /** Variables modifiables dans la carte, dans l'ordre d'affichage. */
  editable: Array<{ name: string; label: string; kind: 'text' | 'longtext' }>;
  /**
   * Variables déjà en HTML (tableaux construits et échappés par le serveur) :
   * insérées telles quelles dans le modèle, non modifiables dans la carte.
   */
  rawVariables?: string[];
  /**
   * Mise en page fournie par la compétence quand le cabinet n'a pas de modèle
   * PDF de ce code (conclusions, note, décompte…).
   */
  template?: InlinePdfTemplate;
  /** Enregistrement à mentionner pour l'envoi par e-mail. */
  recipient?: { type: string; id: number; label: string };
  /**
   * Document complet (studio du chat) : la carte affiche l'aperçu, l'éditeur
   * et l'export Word / PDF au lieu des champs `editable`.
   */
  studio?: StudioDocument;
}

/**
 * Document rédigé ou rempli par l'IA, ou modèle à enregistrer. Le corps est un
 * HTML sûr (construit par `document-markup`) ; les variables qui y restent
 * ({{client.full_name}}, {{cabinetName}}…) sont remplies par le chat avec la
 * fiche `entityType` / `entityId` et les informations du cabinet.
 */
export interface StudioDocument {
  /** document : à générer ; template : modèle à enregistrer dans « Modèles de documents ». */
  mode: 'document' | 'template';
  /**
   * Document classé dont ce brouillon est la modification : « Classer » en
   * fait la version suivante (même document) au lieu d'un doublon.
   */
  sourceDocument?: {
    id: number;
    name: string;
    version: number;
    format: 'docx' | 'pdf' | 'other';
    categoryId?: number | null;
  };
  /** Rédigé sans modèle : la carte propose de l'enregistrer comme modèle. */
  suggestTemplate?: boolean;
  html: string;
  /** Titre encadré en tête du document (vide : aucun, le corps porte son titre). */
  title: string;
  /** En-tête, pied de page, police et format repris d'un modèle du cabinet. */
  layout?: StudioLayout;
  /** Pièces lues pour la rédaction. */
  sources?: Array<{ name: string; origin: 'dossier' | 'chat' }>;
  /** Points à vérifier ou à compléter avant usage. */
  checks?: string[];
  /** Modèle du cabinet dont le document est tiré. */
  basedOn?: { id: number; name: string };
  /** Mode template : fiche du modèle à enregistrer. */
  template?: {
    name: string;
    entity_type: string;
    description: string;
    variables: Array<{ name: string; description: string }>;
  };
}

export interface StudioLayout {
  templateId?: number;
  orientation: 'portrait' | 'landscape';
  paper_size: string;
  font_family: string | null;
  header_block_id: number | null;
  footer_block_id: number | null;
  /** Taille (pt) et interligne du texte, marges, numéros de page (`pdf_templates.layout_options`). */
  font_size?: number | null;
  line_height?: number | null;
  margins?: 'narrow' | 'normal' | 'wide' | null;
  page_numbers?: boolean;
}

/** Modèle PDF intégré à une compétence (mêmes champs que `pdf_templates`). */
export interface InlinePdfTemplate {
  code: string;
  name: string;
  entity_type: 'general';
  variant: string;
  title: string;
  body_html: string;
  orientation: 'portrait' | 'landscape';
  paper_size: 'a4';
  font_family: null;
  header_block_id: null;
  footer_block_id: null;
}

/**
 * Modèle (mail, document PDF ou bloc d'en-tête / pied de page) proposé par le
 * chat, version actuelle ou réécrite : la carte montre l'aperçu et l'éditeur ;
 * rien n'est enregistré avant « Enregistrer le modèle ». La compétence reste en
 * attente : la réponse suivante retouche la version affichée (renvoyée en `revise`).
 */
export interface MailTemplateDraft {
  /** Document : taille, interligne, marges, numéros de page (`pdf_templates.layout_options`). */
  layout_options?: Record<string, unknown> | null;
  /** Famille du modèle (mail par défaut). */
  family?: 'mail' | 'pdf' | 'bloc';
  /** create : nouveau modèle (id null, créé par « Créer le modèle ») ; update : modèle existant. */
  mode: 'create' | 'update';
  id: number | null;
  code: string;
  name: string;
  category?: string;
  audience?: string;
  description?: string;
  /** Objet du mail ('' pour un document ou un bloc). */
  subject: string;
  /** Titre imprimé en tête d'un document PDF. */
  title?: string;
  body_html: string;
  /** Version enregistrée, pour revenir en arrière dans la carte. */
  original: { subject: string; body_html: string; name?: string; title?: string };
  header_block_id: number | null;
  footer_block_id: number | null;
  font_family: string | null;
  /** Mise en page d'un document PDF (aperçu). */
  orientation?: string;
  paper_size?: string;
  /** Bloc : canal et nature (aperçu). */
  channel?: 'mail' | 'pdf';
  kind?: 'header' | 'footer';
  /**
   * Autres champs changés par la demande (activation, orientation, en-tête…),
   * enregistrés avec la carte, et leur version en clair (« Orientation : paysage »).
   */
  changes?: Record<string, unknown>;
  changeLabels?: string[];
  /** Variables {{…}} disponibles (celles du modèle). */
  variables: string[];
}

/** Message prêt à partir par un canal externe (WhatsApp). */
export interface MessageDraft {
  channel: 'whatsapp';
  customerId?: number;
  recipientName: string;
  phone: string;
  /** Numéros connus du destinataire (le premier est pris par défaut). */
  phones?: Array<{ label: string; value: string }>;
  text: string;
  references?: DraftReference[];
}

/**
 * Élément de la fiche visée, insérable dans un brouillon (menu « Insérer une
 * référence » des éditeurs du chat) : n° de dossier, juridiction, adresse du
 * client, prochaine audience, facture due… avec son lien dans l'application.
 */
export interface DraftReference {
  group: string;
  label: string;
  value: string;
  href?: string;
}

/** Bouton de téléchargement d'un export existant (appelé avec le jeton). */
export interface AiSkillDownload {
  label: string;
  /** Route relative de l'API (`exports/dossiers/91`). */
  endpoint: string;
  fileName: string;
}

export type AiSkillOutcome =
  /**
   * Plan à confirmer (carte « Confirmation requise » existante), précédé
   * éventuellement d'une analyse en markdown (jugement lu, délais calculés…).
   */
  | { type: 'plan'; plan: WritePlan; markdown?: string; followUps?: AiSkillFollowUp[] }
  /**
   * Écriture guidée : le planificateur prépare le plan sur ces seules tables
   * (création d'audience, de diligence…), puis la carte de confirmation.
   * `instruction` s'ajoute à la demande enrichie (mentions @ et leurs ids).
   */
  | { type: 'write'; tables: string[]; instruction?: string }
  /** Réponse en markdown, avec des suites éventuelles. */
  | { type: 'answer'; markdown: string; followUps?: AiSkillFollowUp[]; download?: AiSkillDownload; streamed?: boolean; chart?: ChartSpec }
  | { type: 'document_draft'; markdown: string; draft: DocumentDraft; followUps?: AiSkillFollowUp[] }
  | { type: 'message_draft'; markdown: string; draft: MessageDraft; followUps?: AiSkillFollowUp[] }
  /**
   * La demande relève d'une autre compétence (« modifie le modèle de contrat »
   * reçu par la rédaction de documents) : le chat la relance une fois avec
   * celle-ci, sur la même demande, avec ces paramètres en plus.
   */
  | { type: 'handoff'; skill: string; params?: Record<string, any> }
  /** Il manque une information (cible…) : on la demande. */
  | {
      type: 'clarify';
      markdown: string;
      /** Réponses toutes prêtes (« Quel document ? »). */
      followUps?: AiSkillFollowUp[];
      /**
       * Demande que la compétence reprendra avec la précision de l'utilisateur,
       * à la place de la demande initiale (ex. le modèle désormais choisi).
       */
      pendingQuestion?: string;
      /** Modèle de mail affiché dans sa carte d'édition pendant la précision. */
      templateDraft?: MailTemplateDraft;
    };

/** Graphique affiché sous la réponse (voir chart-spec). */
export type { ChartSpec };

/** Appels au modèle de la requête (suivi de consommation compris). */
export interface AiSkillLlm {
  /** Réponse complète (JSON attendu : voir `parseLlmJson`). */
  complete(prompt: string, maxTokens?: number): Promise<string>;
  /** Réponse affichée au fil de l'eau dans le chat ; renvoie le texte complet. */
  stream(prompt: string): Promise<string>;
  /**
   * Rédaction longue (acte, contrat, modèle) : lue en flux, sans le délai
   * global des appels courts. `live` affiche le texte ligne à ligne dans le
   * chat jusqu'à la ligne `===NOTES===` ; la progression passe dans le statut.
   */
  draft?(prompt: string, options?: { maxTokens?: number; live?: boolean }): Promise<string>;
}

export interface AiSkillContext {
  /** Demande de l'utilisateur, sans le texte des pièces jointes. */
  question: string;
  references: ReferencedEntityContext[];
  /** Passage cité par l'utilisateur. */
  quote?: string | null;
  /** Texte lu des pièces jointes (et documents repris). */
  documents: Array<{ name: string; content: string; /** Mise en forme d'origine (Word joint). */ html?: string }>;
  /** Préremplissage transmis par un bouton de suite. */
  params: Record<string, any>;
  user: any;
  userId: string;
  /**
   * Messages visibles récents (le plus ancien d'abord), avec les fiches qu'ils
   * citent (mentions @, enregistrements lus) : « ce modèle », « cette facture »
   * se résolvent à partir des tours précédents.
   */
  history: Array<{ role: string; content: string; refs?: Array<{ entity?: string; type?: string; id: string | number; label?: string }> }>;
  llm: AiSkillLlm;
  /** Étape affichée pendant le traitement. */
  status(message: string): void;
  /**
   * Étape à part dans le déroulé du chat (ex. `template` : « Modèle utilisé »
   * avec le nom du modèle), au lieu d'un simple message de progression.
   */
  step?(key: string, message: string, detail?: string): void;
  /** Texte des pièces de la GED (lecture et OCR du chat), dans le cabinet courant. */
  readDocuments(ids: number[]): Promise<Array<{ id: number; name: string; content: string }>>;
  /**
   * Document classé à modifier : Word rendu en HTML (mise en forme gardée),
   * PDF en texte lu (pdf-parse, OCR). null s'il est introuvable ou illisible.
   */
  readDocumentForEdit?(id: number): Promise<EditableDocument | null>;
  /** Extraits de la base juridique de la plateforme sur `query` ('' si rien de pertinent). */
  legalSources(query: string): Promise<string>;
  /** Profil de l'utilisateur connecté (rôle, droits, cabinet, plan), pour la rédaction. */
  userContext?: string;
}

export interface AiSkillHandler {
  readonly definition: AiSkillDefinition;
  run(ctx: AiSkillContext): Promise<AiSkillOutcome>;
}

/** Document de la GED repris par « modifier un document ». */
export interface EditableDocument {
  id: number;
  name: string;
  /** Word : HTML de mammoth ; PDF : vide (le texte seul est lisible). */
  html: string;
  text: string;
  format: 'docx' | 'pdf' | 'other';
  mimetype: string | null;
  version: number;
  dossierId: number | null;
  categoryId: number | null;
  confidential: boolean;
}

/** Ce que le chat reçoit du catalogue (sans les permissions). */
export interface AiSkillCatalogItem {
  code: string;
  label: string;
  description: string;
  icon: string;
  category: AiSkillCategory;
  categoryLabel: string;
  targets: AiSkillTargetType[];
  targetRequired: boolean;
  placeholder: string;
  examples: string[];
  keywords: string[];
  autoLaunchOnConsultation?: boolean;
  autoTriggers?: string[];
  autoExclude?: string[];
}
