// src/core/ai-database/skills/ai-skill.types.ts
import type { ReferencedEntityContext } from '../dto/ask-question.dto';
import type { WritePlan } from '../dto/analysis-response.dto';

/**
 * Compétence du chat (« # » dans la saisie) : une action spécialisée choisie
 * explicitement par l'utilisateur. Elle ne passe pas par la détection
 * d'intention : son handler résout la cible (mentions @ ou page courante),
 * rédige ce qu'il faut, puis renvoie toujours un résultat à valider. Rien ne
 * part sans clic de l'utilisateur.
 */

export type AiSkillCategory = 'communication' | 'documents' | 'analyse' | 'actes' | 'rapports' | 'agenda';

/** Ordre des familles dans le menu « Compétences ». */
export const AI_SKILL_CATEGORIES: Array<{ code: AiSkillCategory; label: string }> = [
  { code: 'communication', label: 'Communication' },
  { code: 'documents', label: 'Documents' },
  { code: 'analyse', label: 'Analyse juridique' },
  { code: 'actes', label: 'Calculs & actes' },
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
}

/** Bouton proposé sous une réponse : relance une autre compétence. */
export interface AiSkillFollowUp {
  label: string;
  skill: string;
  question: string;
  params?: Record<string, any>;
  /** Mention à joindre (cible déjà connue). */
  reference?: { type: string; id: number | string; label: string; href?: string };
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

/** Message prêt à partir par un canal externe (WhatsApp). */
export interface MessageDraft {
  channel: 'whatsapp';
  customerId?: number;
  recipientName: string;
  phone: string;
  text: string;
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
  | { type: 'plan'; plan: WritePlan; markdown?: string }
  /**
   * Écriture guidée : le planificateur prépare le plan sur ces seules tables
   * (création d'audience, de diligence…), puis la carte de confirmation.
   * `instruction` s'ajoute à la demande enrichie (mentions @ et leurs ids).
   */
  | { type: 'write'; tables: string[]; instruction?: string }
  /** Réponse en markdown, avec des suites éventuelles. */
  | { type: 'answer'; markdown: string; followUps?: AiSkillFollowUp[]; download?: AiSkillDownload; streamed?: boolean }
  | { type: 'document_draft'; markdown: string; draft: DocumentDraft; followUps?: AiSkillFollowUp[] }
  | { type: 'message_draft'; markdown: string; draft: MessageDraft }
  /** Il manque une information (cible…) : on la demande. */
  | { type: 'clarify'; markdown: string };

/** Appels au modèle de la requête (suivi de consommation compris). */
export interface AiSkillLlm {
  /** Réponse complète (JSON attendu : voir `parseLlmJson`). */
  complete(prompt: string, maxTokens?: number): Promise<string>;
  /** Réponse affichée au fil de l'eau dans le chat ; renvoie le texte complet. */
  stream(prompt: string): Promise<string>;
}

export interface AiSkillContext {
  /** Demande de l'utilisateur, sans le texte des pièces jointes. */
  question: string;
  references: ReferencedEntityContext[];
  /** Passage cité par l'utilisateur. */
  quote?: string | null;
  /** Texte lu des pièces jointes (et documents repris). */
  documents: Array<{ name: string; content: string }>;
  /** Préremplissage transmis par un bouton de suite. */
  params: Record<string, any>;
  user: any;
  userId: string;
  /** Messages visibles récents (le plus ancien d'abord). */
  history: Array<{ role: string; content: string }>;
  llm: AiSkillLlm;
  /** Étape affichée pendant le traitement. */
  status(message: string): void;
  /** Texte des pièces de la GED (lecture et OCR du chat), dans le cabinet courant. */
  readDocuments(ids: number[]): Promise<Array<{ id: number; name: string; content: string }>>;
  /** Extraits de la base juridique de la plateforme sur `query` ('' si rien de pertinent). */
  legalSources(query: string): Promise<string>;
  /** Profil de l'utilisateur connecté (rôle, droits, cabinet, plan), pour la rédaction. */
  userContext?: string;
}

export interface AiSkillHandler {
  readonly definition: AiSkillDefinition;
  run(ctx: AiSkillContext): Promise<AiSkillOutcome>;
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
  autoTriggers?: string[];
  autoExclude?: string[];
}
