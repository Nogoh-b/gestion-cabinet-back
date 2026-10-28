// src/core/ai-database/intent-detection.service.ts
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { IntentDetectionResult } from './interface/write-intent.interface';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { actionTargetTable, AiActionRegistry } from './write/ai-action.registry';
import {
  matchHelpDocs,
  normalizeHelpText,
  splitPageContext,
} from './help-knowledge';
import { WriteOperation, WritePlan } from './dto/analysis-response.dto';
import { AI_DATABASE_PROJECT_CONFIG } from './ai-database.tokens';
import { AiDatabaseProjectConfig } from './interfaces/ai-database-project-config.interface';
import { LegalKnowledgeMatch } from './legal-knowledge';
import {
  SourceSignals,
  describeSignals,
  extractRecordReference,
  isAnchoredInCabinet,
  isDecisiveKnowledgeRoute,
  isKnowledgeQuestion,
  isUnlikelyDatabaseQuestion,
  summarizeLegalMatches,
} from './source-signals';
import { mentionsTemplate, TEMPLATE_SKILLS } from './skills/template-routing';

type IntentClass = 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT';

const INTENT_CLASSES: IntentClass[] = ['READ', 'WRITE', 'HELP', 'ADVICE', 'CHAT'];

/** Partie d'une demande enchaînée (« READ+SKILL:whatsapp »). */
export interface ClassifiedPart {
  kind: IntentClass | 'SKILL';
  skill?: string;
}

/**
 * Verdict du classifieur : une classe, et la seconde quand il hésite ;
 * `SKILL` + code quand une compétence candidate répond à la demande ;
 * `parts` quand la demande en enchaîne plusieurs.
 */
export interface LightClassification {
  value: IntentClass | 'SKILL';
  alternative?: IntentClass;
  skill?: string;
  parts?: ClassifiedPart[];
}

/** Compétence proposée au classifieur (code, libellé, description). */
export interface SkillCandidate {
  code: string;
  label: string;
  description: string;
}

const CLASS_TOKEN = /^(READ|WRITE|HELP|ADVICE|CHAT)$|^SKILL\s*[:=]\s*([A-Z0-9_]+)$/;

function parseClassToken(token: string): ClassifiedPart | null {
  const match = CLASS_TOKEN.exec(token.trim().replace(/^\W+|[^\w]+$/g, ''));
  if (!match) return null;
  return match[1]
    ? { kind: match[1] as IntentClass }
    : { kind: 'SKILL', skill: match[2].toLowerCase() };
}

/** Raison affichée dans le chat quand une règle locale décide du mode. */
export const LOCAL_ROUTE_REASONS: Record<IntentClass, string> = {
  HELP: "question sur l'utilisation de l'application",
  ADVICE: 'demande de conseil',
  CHAT: 'question générale, sans les données du cabinet',
  READ: 'consultation des données du cabinet',
  WRITE: 'demande de création ou de modification',
};

/**
 * Réponse du classifieur → classe retenue, et la seconde quand il répond
 * explicitement « READ|CHAT » (première ligne). Un texte après le premier mot
 * est toléré ; une réponse qui ne commence pas par une classe (raisonnement
 * en prose, avis de modération…) est illisible : null, comme une réponse vide.
 */
export function parseLightClassification(raw: string): LightClassification | null {
  const text = raw.toUpperCase().trim();
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  // Demandes enchaînées : « HELP+READ », « READ+SKILL:WHATSAPP » (3 au plus).
  if (firstLine.includes('+')) {
    const parts = firstLine.split('+').map(parseClassToken);
    if (parts.length >= 2 && parts.length <= 3 && parts.every(Boolean)) {
      const valid = parts as ClassifiedPart[];
      return { value: valid[0].kind, ...(valid[0].skill && { skill: valid[0].skill }), parts: valid };
    }
  }
  const skillAnswer = /^\W*SKILL\s*[:=]\s*([A-Z0-9_]+)/.exec(firstLine);
  if (skillAnswer) return { value: 'SKILL', skill: skillAnswer[1].toLowerCase() };
  const pair = firstLine.match(
    /^\W*(READ|WRITE|HELP|ADVICE|CHAT)\s*(?:\||\/|,|\bOU\b|\bOR\b)\s*(READ|WRITE|HELP|ADVICE|CHAT)\W*$/,
  );
  if (pair) {
    const [value, alternative] = [pair[1], pair[2]] as IntentClass[];
    return alternative !== value ? { value, alternative } : { value };
  }
  const letters = text.replace(/[^A-Z]/g, '');
  const value = INTENT_CLASSES.find((item) => letters.startsWith(item));
  return value ? { value } : null;
}

@Injectable()
export class IntentDetectionService {
  private readonly logger = new Logger(IntentDetectionService.name);
  private readonly CACHE_TTL = 2 * 60 * 1000;
  private readonly classificationCache = new Map<
    string,
    { result: LightClassification; timestamp: number }
  >();
  private writeSchemaCache: { value: string; timestamp: number } | null = null;

  /**
   * Regex des mots-clés métier, construite à partir de la config projet.
   * Fallback : noms des essentialTables si aucun domainKeywords fourni.
   */
  private domainKeywordsRegex!: RegExp;

  /**
   * Pronoms/références anaphoriques qui signalent une question de suivi.
   * Agnostique du domaine métier — seule la grammaire française est encodée ici.
   */
  private readonly FOLLOW_UP_SIGNALS =
    /\b(cell?(?:e|ui)(?:[- ](?:ci|la))?|ceux|celles|le(?:s)?\s+(?:dernier|premier|meme)|la\s+(?:derniere|premiere|meme)|l[ea]\s+(?:plus|moins|seul|premier|dernier)|parmi\s+(?:eux|elles|ces|les)|dans\s+(?:cette|ce|ces|la)\s+liste)\b/;

  /**
   * Verbe correctif à l'impératif en début de phrase (éventuellement précédé d'une
   * formule de politesse). Les verbes ambigus en lecture (annule, valide) sont exclus.
   */
  private readonly CORRECTIVE_REQUEST =
    /^\s*(?:(?:s'il (?:te|vous) plait|stp|svp|peux-tu|pouvez-vous|merci de|veuillez)[ ,]+)?(?:corrige|corrigez|corriger|rectifie|rectifiez|rectifier|repare|reparez|reparer|regularise|regularisez|regulariser|renomme|renommez|renommer|fusionne|fusionnez|fusionner|dedoublonne|dedoublonnez|dedoublonner|harmonise|harmonisez|harmoniser|nettoie|nettoyez|nettoyer|resous|resolvez|resoudre|applique|appliquez|appliquer)\b/;

  /**
   * Synthèse, résumé ou point de situation sur un enregistrement : une
   * lecture des données, même quand la demande cite « prochaines étapes »
   * (sinon classée conseil, la réponse n'interrogeait pas la base).
   */
  private readonly RECORD_SUMMARY_REQUEST =
    /\b(?:synthese|resume|resumer|recapitulatif|recap|point\s+sur|faire\s+le\s+point|fais\s+le\s+point|etat\s+(?:du|de\s+la|des|d)|situation\s+(?:du|de\s+la|des|d))\b/;

  /**
   * Demande d'envoi à l'impératif en début de phrase (« envoie la facture… »,
   * « relance le client… ») : une action, même quand la phrase contient
   * « la dernière facture » qui la ferait passer pour une lecture.
   * « envoie-moi la liste… » reste une lecture.
   */
  private readonly SEND_REQUEST =
    /^\s*(?:(?:s'il (?:te|vous) plait|stp|svp|peux-tu|pouvez-vous|merci de|veuillez|je veux|je voudrais|j'aimerais)[ ,]+)?(?:re)?(?:envoie|envoyez|envoyer|relance|relancez|relancer|transmets|transmettez|transmettre)\b(?![- ]moi\b)/;

  /** Verbe d'envoi n'importe où dans la phrase (mots entiers). */
  private readonly SEND_VERB =
    /\b(?:re)?(?:envoie|envoyez|envoyer|relance|relancez|relancer|transmets|transmettez|transmettre)\b(?![- ]moi\b)/;

  constructor(
    private readonly writeHandlerRegistry: WriteHandlerRegistry,
    @Optional()
    @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
    @Optional() private readonly actionRegistry?: AiActionRegistry,
  ) {
    this.buildDomainKeywordsRegex();
  }

  /**
   * Construit la regex des mots-clés métier à partir de la config projet.
   * Si `domainKeywords` n'est pas fourni, utilise les noms des `essentialTables`.
   */
  private buildDomainKeywordsRegex(): void {
    const keywords = this.projectConfig?.domainKeywords;
    if (keywords?.length) {
      // Échapper les caractères regex spéciaux dans les mots-clés
      const escaped = keywords.map((k) =>
        k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
      this.domainKeywordsRegex = new RegExp(
        `\\b(${escaped.join('|')})\\b`,
        'i',
      );
      return;
    }
    // Fallback : noms des essentialTables
    const tables =
      this.projectConfig?.databaseTablesConfig?.essentialTables ?? [];
    if (tables.length) {
      const escaped = tables.map((t) =>
        t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      );
      this.domainKeywordsRegex = new RegExp(
        `\\b(${escaped.join('|')})\\b`,
        'i',
      );
      return;
    }
    // Dernier recours : regex qui ne matche jamais
    this.domainKeywordsRegex = /(?!)/;
  }

  async detectIntent(
    question: string,
    llm: ChatOpenAI,
    readSchema: string,
    options: {
      forceWrite?: boolean;
      history?: string;
      plannerLlm?: ChatOpenAI;
      onLlmCall?: (info: {
        profile: 'fast' | 'quality';
        input: unknown;
        modelName?: string;
      }) => void;
      classifierModelName?: string;
      plannerModelName?: string;
      /** Indices locaux (voir computeSourceSignals) : guident le classifieur. */
      signals?: SourceSignals;
      /**
       * Compétence d'écriture guidée (« Programmer une audience »…) : le
       * planificateur ne voit que ces tables.
       */
      onlyTables?: string[];
      /**
       * Le chat peut demander le mode à l'utilisateur : quand le classifieur
       * hésite entre deux classes, le résultat est UNCERTAIN (avec les deux
       * candidates) au lieu d'un choix au hasard.
       */
      allowModeChoice?: boolean;
      /**
       * Compétences évoquées par la demande (mode auto) : le classifieur peut
       * répondre SKILL:<code> quand l'une d'elles y répond clairement.
       */
      skillCandidates?: SkillCandidate[];
      /** Le chat sait traiter plusieurs demandes enchaînées dans une réponse. */
      allowComposite?: boolean;
    } = {},
  ): Promise<IntentDetectionResult> {
    // 1️⃣ Pré-filtre rapide : éviter un appel LLM pour les WRITE évidents
    const localClass = options.forceWrite
      ? 'WRITE'
      : this.classifyLocal(question);
    const isObviousWrite = options.forceWrite || localClass === 'WRITE';
    // Demande d'agir sans équivoque (mode écriture choisi, ou verbe correctif) :
    // le planner ne peut répondre ni READ ni ADVICE, sinon « corrige les points
    // d'attention » devient une simple liste de recommandations.
    const strictWrite =
      !!options.forceWrite ||
      this.CORRECTIVE_REQUEST.test(this.normalizeText(question).trim());

    if (localClass === 'HELP') {
      return { type: 'HELP', requiresConfirmation: false, reason: LOCAL_ROUTE_REASONS.HELP };
    }

    if (localClass === 'ADVICE') {
      return { type: 'ADVICE', requiresConfirmation: false, reason: LOCAL_ROUTE_REASONS.ADVICE };
    }

    if (localClass === 'CHAT') {
      return { type: 'CONVERSATIONAL', requiresConfirmation: false, reason: LOCAL_ROUTE_REASONS.CHAT };
    }

    // Demande sur un modèle avec ses compétences en lice : le classifieur tranche
    // entre elles et la lecture (« cherche dans ce modèle… » n'est pas une requête SQL).
    const templateSkillOffered =
      (options.skillCandidates ?? []).some((candidate) => candidate.code === TEMPLATE_SKILLS.produce || candidate.code === TEMPLATE_SKILLS.manage)
      && mentionsTemplate(question);
    if (localClass === 'READ' && !templateSkillOffered) {
      return { type: 'READ', requiresConfirmation: false, reason: LOCAL_ROUTE_REASONS.READ };
    }
    const writeReason =
      !options.forceWrite && localClass === 'WRITE' ? LOCAL_ROUTE_REASONS.WRITE : undefined;

    if (
      !isObviousWrite &&
      options.signals &&
      isDecisiveKnowledgeRoute(options.signals)
    ) {
      // La base juridique couvre la question et rien ne la rattache au
      // cabinet : réponse par les connaissances, sans appel au classifieur.
      this.logger.log(
        '🏷️ Signaux → CHAT (base juridique, sans ancrage cabinet)',
      );
      return {
        type: 'CONVERSATIONAL',
        requiresConfirmation: false,
        reason: 'sujet couvert par la base juridique de la plateforme',
      };
    }

    if (!isObviousWrite) {
      // 1b. Classification légère via LLM : READ | WRITE | CHAT
      //     (plus fiable que des heuristiques statiques)
      const classified = await this.lightClassify(question, llm, {
        ...options,
        history: options.history,
      });
      this.logger.log(
        `🏷️ Light classify → ${classified.parts ? classified.parts.map((part) => part.skill ? `SKILL:${part.skill}` : part.kind).join('+') : classified.skill ? `SKILL:${classified.skill}` : classified.value}${classified.alternative ? ` (hésite avec ${classified.alternative})` : ''}`,
      );
      const knownSkill = (code?: string) =>
        !!code && (options.skillCandidates ?? []).some((candidate) => candidate.code === code);
      // Plusieurs demandes enchaînées : le chat les traite l'une après l'autre.
      if (classified.parts && options.allowComposite) {
        const parts = classified.parts.filter((part) => part.kind !== 'SKILL' || knownSkill(part.skill));
        if (parts.length >= 2 && new Set(parts.map((part) => part.skill ?? part.kind)).size >= 2) {
          return { type: 'COMPOSITE', parts, requiresConfirmation: false, reason: 'plusieurs demandes dans la même question' };
        }
      }
      if (classified.value === 'SKILL' || classified.parts?.[0]?.kind === 'SKILL') {
        const skill = classified.skill ?? classified.parts?.[0]?.skill;
        if (knownSkill(skill)) {
          return { type: 'SKILL', skill, requiresConfirmation: false, reason: 'compétence reconnue dans la demande' };
        }
      }
      let lightClass: IntentClass =
        classified.value === 'SKILL'
          ? this.fallbackClass(options.signals)
          : classified.value;
      let alternative = classified.alternative;
      let reason: string | undefined;
      // Un numéro d'enregistrement cité se lit dans la base, même quand le
      // classifieur y voit une question générale.
      const recordReference = options.signals?.recordReference;
      if (lightClass === 'CHAT' && recordReference) {
        this.logger.log(`🏷️ CHAT → READ (numéro cité : ${recordReference})`);
        lightClass = 'READ';
        reason = `numéro cité (${recordReference})`;
      }
      if (alternative === lightClass || (alternative === 'CHAT' && recordReference)) {
        alternative = undefined;
      }
      // Le classifieur hésite : le chat propose les deux modes avant d'aller plus loin.
      if (alternative && options.allowModeChoice) {
        return {
          type: 'UNCERTAIN',
          candidates: [lightClass, alternative],
          requiresConfirmation: false,
        };
      }

      if (lightClass === 'HELP') {
        return { type: 'HELP', requiresConfirmation: false };
      }

      if (lightClass === 'ADVICE') {
        return { type: 'ADVICE', requiresConfirmation: false };
      }

      if (lightClass === 'CHAT') {
        // Ne pas pré-générer la réponse ici (appel bloquant).
        // analyzeQuestionStream() streamera la réponse directement via llm.stream().
        return { type: 'CONVERSATIONAL', requiresConfirmation: false };
      }
      if (lightClass === 'READ') {
        return { type: 'READ', requiresConfirmation: false, ...(reason && { reason }) };
      }
      // lightClass === 'WRITE' → on laisse tomber dans la branche WRITE ci-dessous
    }

    // 2️⃣ Générer le schéma d'écriture
    const handlers = this.writeHandlerRegistry.getAllHandlers();
    this.logger.log(
      `📝 Handlers enregistrés: ${handlers.length} → [${handlers.map((h) => h.entityName).join(', ')}]`,
    );

    const writeSchema = options.onlyTables?.length
      ? `${await this.writeHandlerRegistry.generateWriteSchemaFor(options.onlyTables)}
Le plan ne porte que sur : ${options.onlyTables.join(', ')} (les autres éléments sont désignés par leur identifiant ou leur numéro).
`
      : await this.getCachedWriteSchema();
    this.logger.log(
      `📝 Schéma d'écriture généré (${writeSchema.length} chars)`,
    );

    // 3️⃣ Prompt amélioré pour les plans complexes
    const prompt = this.buildAdvancedDetectionPrompt(
      question,
      readSchema,
      writeSchema,
      options.history,
      strictWrite,
    );
    const planner = options.plannerLlm ?? llm;

    // « Tout faire » pour honorer une demande WRITE avant d'abandonner — surtout
    // quand l'utilisateur a explicitement forcé le mode écriture (forceWrite) :
    // dans ce cas on ne doit JAMAIS retomber silencieusement en READ (ça envoie
    // la demande dans la mauvaise branche, qui génère alors des refus SQL
    // absurdes du type "opération non autorisée").
    //
    // Trois natures d'échec, trois stratégies de retry :
    // - erreur de CONNEXION (réseau/fournisseur, ex: "Connection error.") →
    //   on retente le MÊME prompt après un court délai (le modèle n'a rien
    //   répondu, le gronder n'a aucun sens).
    // - réponse TRONQUÉE (finish_reason=length, JSON coupé en plein milieu) →
    //   le budget de tokens était insuffisant : on retente en demandant un
    //   plan plus concis (pas de texte superflu), jamais la scolarisation
    //   "ta reponse etait invalide" qui n'aide pas ici.
    // - réponse reçue complète mais JSON invalide / plan incomplet → on
    //   retente avec un prompt correctif qui pointe l'erreur.
    let lastError: string | undefined;
    let lastWasConnectionError = false;
    let lastWasTruncated = false;
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && lastWasConnectionError) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
      const attemptPrompt =
        attempt === 0 || lastWasConnectionError
          ? prompt
          : lastWasTruncated
            ? `${prompt}\n\n⚠️ Ta reponse precedente a ete COUPEE avant la fin (JSON incomplet) car trop longue. Reponds UNIQUEMENT avec le JSON, SANS aucun texte de reflexion avant/apres, avec des "humanReadable" TRES courts (moins de 15 mots). Va droit au but.`
            : `${prompt}\n\n⚠️ Ta reponse precedente etait invalide (${lastError}). Reponds UNIQUEMENT avec un JSON strictement valide, sans commentaire ni texte autour, en respectant exactement le format demande.`;
      let isTruncated = false;
      try {
        const input = [{ role: 'user', content: attemptPrompt }];
        options.onLlmCall?.({
          profile: 'quality',
          input,
          modelName: options.plannerModelName,
        });
        const response = await planner.invoke(input);
        const content = this.extractLlmText(response);
        const finishReason =
          (response as any)?.response_metadata?.finish_reason ??
          (response as any)?.generationInfo?.finish_reason;
        isTruncated = finishReason === 'length';

        this.logger.debug(
          `📥 Réponse LLM (tentative ${attempt + 1}, ${content.length} chars, finish_reason=${finishReason ?? '?'}): ` +
            `${content.substring(0, 500)}...`,
        );
        if (isTruncated) {
          this.logger.warn(
            `✂️ Réponse tronquée (finish_reason=length) — le budget de tokens du planner est insuffisant pour ce plan.`,
          );
        }

        const result = this.parseResponse(content);

        if (strictWrite && result.type !== 'WRITE') {
          // Traité comme une réponse invalide : nouvel essai avec rappel de la consigne.
          throw new Error(
            `type "${result.type}" renvoyé alors que la demande exige un plan d'écriture (WRITE)`,
          );
        }
        if (result.type === 'READ') {
          return { type: 'READ', requiresConfirmation: false };
        }
        if (result.type === 'HELP') {
          return { type: 'HELP', requiresConfirmation: false };
        }
        if (result.type === 'ADVICE') {
          return { type: 'ADVICE', requiresConfirmation: false };
        }

        // Valider et enrichir le plan
        const validatedPlan = this.validateAndEnrichPlan(result.writePlan);

        const requiresConfirmation =
          validatedPlan.confidence < 0.85 ||
          validatedPlan.operations.length > 1 ||
          // Une mise à jour groupée touche un nombre inconnu de lignes ;
          // une action (e-mail envoyé…) ne se rattrape pas.
          validatedPlan.operations.some(
            (op) => op.operation === 'DELETE' || op.operation === 'ACTION' || op.all,
          );

        if (attempt > 0)
          this.logger.log(`✅ Plan WRITE généré à la tentative ${attempt + 1}`);
        return {
          type: 'WRITE',
          writePlan: validatedPlan,
          requiresConfirmation,
          ...(writeReason && { reason: writeReason }),
        };
      } catch (error) {
        lastWasConnectionError = this.isConnectionError(error);
        lastWasTruncated = !lastWasConnectionError && isTruncated;
        lastError = (error as Error).message;
        this.logger.warn(
          `⚠️ Génération du plan WRITE — tentative ${attempt + 1} échouée` +
            `${lastWasConnectionError ? ' (erreur de connexion)' : lastWasTruncated ? ' (reponse tronquee)' : ''}: ${lastError}`,
        );
      }
    }

    this.logger.error(
      `❌ Génération du plan WRITE impossible après ${maxAttempts} tentatives: ${lastError}`,
    );

    if (strictWrite) {
      // L'utilisateur a explicitement demandé l'écriture : ne JAMAIS masquer
      // l'échec en READ silencieux. On remonte un échec explicite que
      // l'appelant doit afficher tel quel à l'utilisateur.
      const humanMessage = lastWasConnectionError
        ? 'Le service IA est temporairement injoignable (erreur de connexion). Réessayez dans quelques instants.'
        : lastWasTruncated
          ? "La demande est trop complexe pour être traitée en une seule fois. Essayez de la découper en plusieurs étapes (ex: créer d'abord le dossier avec le client et l'avocat, puis ajouter la procédure et les autres détails dans un second message)."
          : lastError || "Le plan d'ecriture n'a pas pu etre genere.";
      return {
        type: 'WRITE',
        requiresConfirmation: false,
        writePlanError: humanMessage,
      };
    }

    // Mode auto (pas de forceWrite) : on tente le SQL en dernier recours,
    // comportement historique conservé pour ne pas regresser les cas READ.
    return { type: 'READ', requiresConfirmation: false };
  }

  /**
   * Détecte une erreur de connexion réseau/fournisseur (ex: APIConnectionError
   * du SDK OpenAI, message "Connection error.") plutôt qu'une réponse invalide.
   * Ces erreurs ne doivent jamais être traitées comme une faute du modèle
   * (pas de prompt correctif "ta réponse était invalide" dans ce cas).
   */
  private isConnectionError(error: unknown): boolean {
    const err = error as {
      constructor?: { name?: string };
      name?: string;
      message?: string;
      code?: string;
    };
    const ctorName = err?.constructor?.name || '';
    const name = err?.name || '';
    const message = err?.message || '';
    const code = err?.code || '';
    return /connection|network|timeout|econnreset|econnrefused|etimedout|enotfound|fetch failed/i.test(
      `${ctorName} ${name} ${message} ${code}`,
    );
  }

  /**
   * Prompt avancé pour la détection multi-opérations
   */
  public classifyLocal(question: string): IntentClass | null {
    const normalized = this.normalizeText(question).trim();
    if (!normalized) return 'CHAT';

    if (this.isHelpIntent(question)) {
      return 'HELP';
    }

    // « corrige les points d'attention », « répare ça » : demande d'agir, jamais un
    // simple conseil, même si le fil précédent parle de recommandations.
    if (this.CORRECTIVE_REQUEST.test(normalized)) {
      return 'WRITE';
    }

    if (this.SEND_REQUEST.test(normalized) && this.actionRegistry?.all().length) {
      return 'WRITE';
    }

    if (
      this.RECORD_SUMMARY_REQUEST.test(normalized) &&
      this.domainKeywordsRegex.test(normalized) &&
      !this.isWriteIntent(question)
    ) {
      return 'READ';
    }

    if (this.isAdviceIntent(question)) {
      return 'ADVICE';
    }

    // Question de droit générale (délais, procédures, textes, définitions)
    // sans lien avec les données du cabinet : réponse par les connaissances
    // du modèle, pas une requête SQL qui reviendrait vide.
    // (isWriteIntent cherche des sous-chaînes : « recouvrement » contient « ouvre ».)
    if (this.isLegalKnowledgeQuestion(normalized) && !this.WRITE_VERB.test(normalized)) {
      return 'CHAT';
    }

    if (this.isChatIntent(normalized)) {
      return 'CHAT';
    }

    // Verbes de lecture (liste, affiche, montre, combien, quel…)
    const readVerbPattern =
      /^(liste|lister|affiche|afficher|montre|montrer|cherche|chercher|trouve|trouver|combien|quels?|quelles?|qui|donne moi|donnez moi)\b/;
    // Mots interrogatifs génériques (nombre, total, statut) suivis d'un ?
    const readQuestionPattern = /\b(nombre|total|statut)\b.*\?/;

    if (
      readVerbPattern.test(normalized) ||
      (readQuestionPattern.test(normalized) &&
        this.domainKeywordsRegex.test(normalized))
    ) {
      return 'READ';
    }

    // Questions de suivi avec pronom anaphorique + mot-clé métier
    // Ex: "donne moi celle qui est totalement payée" → READ
    if (
      this.FOLLOW_UP_SIGNALS.test(normalized) &&
      this.domainKeywordsRegex.test(normalized)
    ) {
      return 'READ';
    }

    if (this.isWriteIntent(question)) {
      return 'WRITE';
    }

    return null;
  }

  private async getCachedWriteSchema(): Promise<string> {
    const now = Date.now();
    if (
      this.writeSchemaCache &&
      now - this.writeSchemaCache.timestamp < this.CACHE_TTL
    ) {
      return this.writeSchemaCache.value;
    }
    const value = await this.writeHandlerRegistry.generateGlobalWriteSchema(
      this.projectConfig?.databaseTablesConfig?.ignoredTables ?? [],
    );
    this.writeSchemaCache = { value, timestamp: now };
    return value;
  }

  private buildAdvancedDetectionPrompt(
    question: string,
    readSchema: string,
    writeSchema: string,
    history?: string,
    strictWrite = false,
  ): string {
    const objective = strictWrite
      ? `Cette demande est une ACTION à exécuter dans la base : réponds TOUJOURS par un plan WRITE (jamais READ, HELP ni ADVICE).
- Quand elle vise des anomalies ou points d'attention déjà évoqués dans l'HISTORIQUE, déduis-en les corrections concrètes (opération UPDATE/DELETE, champs et valeurs) à partir des éléments cités.
- Si une valeur est incertaine, propose la plus raisonnable avec une confiance basse (< 0.85) : l'utilisateur validera le plan avant toute exécution.`
      : `Décomposer cette demande en un PLAN d'opérations.
- Si c'est une simple lecture → { "type": "READ" }
- Si l'utilisateur demande comment faire, où cliquer, ou une procédure à suivre → { "type": "HELP" }
- Si l'utilisateur demande un conseil, une recommandation, quoi ajouter, quoi améliorer, ou une suggestion basée sur le contexte → { "type": "ADVICE" }
- Si c'est une création/modification → génère un plan avec les dépendances
- Si c'est un envoi (facture, relance d'impayés…) → plan WRITE avec une opération "ACTION" (voir ACTIONS DISPONIBLES)`;
    const genericWriteExample = `{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      { "operation": "INSERT", "entity": "customer", "tempId": "new_client",
        "fields": { "first_name": "Jean", "last_name": "Dupont", "email": "jean@example.com" } }
    ],
    "humanReadable": "Créer le client Jean Dupont",
    "confidence": 0.95
  }
}`;

    return `Tu es un expert en analyse de demandes pour une base de données.

## 🧠 RÉFLEXION
Avant de répondre, analyse soigneusement :
1. Quelle est l'intention EXACTE de l'utilisateur ?
2. Quelles entités sont impliquées ?
3. Y a-t-il des dépendances entre les entités (ex: dossier nécessite un client) ?
4. Quels champs sont fournis explicitement et lesquels doivent être déduits ?
5. La confiance est-elle suffisante pour exécuter directement ?

## 📖 SCHÉMA DE LECTURE (pour comprendre les relations)
${readSchema.substring(0, 10000)}

## 📝 ENTITÉS MODIFIABLES
${writeSchema}
${this.actionRegistry?.promptSection() ?? ''}${history ? `\n## 🗨️ HISTORIQUE RÉCENT DE LA CONVERSATION (le plus ancien en premier)\n${history}\n` : ''}
## ❓ DEMANDE UTILISATEUR
"${question}"

## 🎯 OBJECTIF
${objective}

## ⚠️ RÈGLES CRITIQUES

### 1. Ordre des opérations
- Les opérations DOIVENT être dans l'ordre des dépendances
- Crée d'abord les entités référencées (ex: client avant dossier)
- Pour chaque entité qui sera référencée, utilise un "tempId"

### 2. Résolution des références
- Utilise "{{tempId.id}}" pour référencer l'ID d'une entité créée
- Exemple: "client_id": "{{new_customer.id}}"

### 3. Champs acceptés
- N'utilise que les champs listés dans "ENTITÉS MODIFIABLES"
- Les noms de champs doivent être exacts
- Liaison vers un enregistrement existant (client_id, dossier_id, lawyer…) : mets son IDENTIFIANT
  numérique s'il figure dans l'historique (« table#id ») ou le contexte ; sinon recopie EXACTEMENT
  son numéro, son code ou son nom complet tel qu'il est écrit (jamais un nom approché ou abrégé).

### 4. Valeurs spéciales
- "{{today}}" → date du jour
- "{{now}}" → timestamp actuel

### 6. 🎯 Identifiants des enregistrements cités (TRÈS IMPORTANT)
Chaque message de l'historique peut être suivi de « [Enregistrements cités (table#id) : …] » :
ce sont les enregistrements que la réponse a montrés (ou créés/modifiés), dans l'ordre, avec leur
identifiant exact. Les liens « [DOS-2026-0004](/dossiers/94) » donnent aussi l'identifiant (94).
- « le », « la », « celui-ci », « ce dossier », « la 2e », « celle en brouillon », « les deux premiers »
  se rapportent à ces enregistrements : utilise leur identifiant comme "entityId" (UPDATE/DELETE/ACTION)
  ou comme valeur de liaison (ex: "dossier_id": 94). Prends l'enregistrement de la MÊME table que
  l'opération, en priorité dans le message le plus récent.
- Même règle pour « ENREGISTREMENTS AFFICHES A L'UTILISATEUR » (#N) et pour les identifiants donnés
  par le contexte de page ou les mentions @.
- Une demande qui précise « (cible : <type> n°<id> « … ») » vise exactement ce type et cet identifiant.
- N'invente JAMAIS un identifiant : un id absent de l'historique, du contexte et de la demande est
  interdit. Sans identifiant connu, applique la règle 7.

### 7. 🔎 Cibler un enregistrement sans identifiant connu (UPDATE/DELETE)
- Ajoute "match" : les valeurs ACTUELLES EXACTES de colonnes réelles qui désignent l'enregistrement
  (ex: {"dossier_number":"DOS-2026-0004"} ou {"start_date":"2026-08-31","label":"ff"}), dates au
  format AAAA-MM-JJ. Le système cherche une égalité exacte ; s'il en trouve plusieurs ou aucune, il
  fait choisir l'utilisateur (aucune correspondance approchée n'est retenue d'office).
- "fields" contient uniquement les NOUVELLES valeurs ; une opération par enregistrement à modifier.
- Modification GROUPÉE (« toutes ses audiences », « tous les dossiers de X », « toutes celles en retard ») :
  UNE seule opération UPDATE avec "match" (critères communs, ex: {"dossier_id":94,"status":0}) et
  "all": true. Le système applique "fields" à chaque enregistrement correspondant du cabinet.
  Si les enregistrements cités ont des identifiants, préfère une opération par identifiant.
- Infos du cabinet (nom, adresse, téléphone, RCCM, NINA, devise, TVA, numérotation, horaires…) :
  entité "cabinets", UNE opération UPDATE sans "entityId" ni "match" (le cabinet courant est
  toujours visé). Jamais d'INSERT ni de DELETE sur "cabinets".
${this.projectConfig?.promptDomainRules ? `\n${this.projectConfig.promptDomainRules}\n` : ''}
## 📤 FORMAT DE RÉPONSE JSON UNIQUEMENT

Pour une LECTURE:
{"type": "READ"}
Pour un CONSEIL:
{"type": "ADVICE"}
${this.projectConfig?.promptDomainExample ? `\nPour une CRÉATION MULTI-ENTITÉS:\n${this.projectConfig.promptDomainExample}\n` : `\nPour une CRÉATION:\n${genericWriteExample}\n`}
Pour une MODIFICATION:
{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      {
        "operation": "UPDATE",
        "entity": "dossiers",
        "entityId": 123,
        "fields": {
          "status": "3",
          "priority_level": 2
        }
      }
    ],
    "humanReadable": "Changer le statut du dossier 123",
    "confidence": 0.95
  }
}

## 🚨 IMPORTANT
- Identifiant connu (historique « table#id », lien, contexte, mention @) → utilise-le tel quel.
- Sinon donne la valeur EXACTE (numéro, code, nom complet) : le système ne retient qu'une
  correspondance exacte et unique, sinon il fait choisir l'utilisateur ; un client sans aucun
  homonyme approchant est créé.
- Nouvel enregistrement à lier (« nouveau client X ») → opération INSERT avec tempId, puis "{{tempId.id}}".

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
  }

  /**
   * Valide et enrichit le plan
   */
  private validateAndEnrichPlan(plan: any): WritePlan {
    if (!plan.operations || !Array.isArray(plan.operations)) {
      throw new Error('Plan invalide: operations manquantes');
    }

    // Enrichir chaque opération
    const enrichedOperations: WriteOperation[] = plan.operations.map(
      (op: any, index: number) => {
        // Nettoyer les champs
        const cleanedFields: Record<string, any> = {};
        for (const [key, value] of Object.entries(op.fields || {})) {
          // Nettoyer les valeurs
          if (typeof value === 'string') {
            cleanedFields[key] = value.trim();
          } else {
            cleanedFields[key] = value;
          }
        }

        if (String(op.operation).toUpperCase() === 'ACTION') {
          return this.enrichActionOperation(op, cleanedFields, index);
        }

        return {
          operation: op.operation,
          entity: op.entity.toLowerCase(),
          entityId: op.entityId ?? op.fields?.id ?? op.fields?.entityId ?? null,
          ...(op.match &&
          typeof op.match === 'object' &&
          !Array.isArray(op.match) &&
          Object.keys(op.match).length > 0
            ? { match: op.match, ...(op.all === true && { all: true }) }
            : {}),
          fields: cleanedFields,
          ...(typeof op.humanReadable === 'string' && op.humanReadable.trim()
            ? { humanReadable: op.humanReadable.trim() }
            : {}),
          tempId: op.tempId || `op_${index}`,
          dependsOn: op.dependsOn || [],
          // ✅ Préserver resolveConfig si fourni par le LLM
          resolveConfig: op.resolveConfig || undefined,
          // Fichier joint d'où viennent les données (vérifié par attachSourceFiles).
          ...(Array.isArray(op.sourceFiles) && {
            sourceFiles: op.sourceFiles.filter((name: unknown) => typeof name === 'string'),
          }),
        };
      },
    );

    return {
      transaction: plan.transaction !== false, // true par défaut
      operations: enrichedOperations,
      humanReadable:
        plan.humanReadable ||
        `Exécution de ${enrichedOperations.length} opération(s)`,
      confidence: Math.min(plan.confidence || 0.8, 1),
    };
  }

  /**
   * Opération ACTION du planificateur : action connue (sinon nouvel essai),
   * table de l'action, et cible lue dans `fields` quand le modèle y a mis la
   * référence (« numero », « dossier_number »…) au lieu de `match`.
   */
  private enrichActionOperation(op: any, fields: Record<string, any>, index: number): WriteOperation {
    const handler = this.actionRegistry?.get(op.action);
    if (!handler) {
      const known = this.actionRegistry?.all().filter((h) => !h.definition.skillOnly).map((h) => h.definition.name).join(', ') || 'aucune';
      throw new Error(`action inconnue "${op.action ?? ''}" (actions possibles : ${known})`);
    }
    const { definition } = handler;
    const paramNames = new Set(definition.params.map((p) => p.name));
    const params: Record<string, any> = {};
    const rest: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (paramNames.has(key)) params[key] = value;
      else if (key !== 'id' && key !== 'entityId') rest[key] = value;
    }
    const entityId = op.entityId ?? op.fields?.id ?? op.fields?.entityId ?? null;
    const match =
      op.match && typeof op.match === 'object' && !Array.isArray(op.match) && Object.keys(op.match).length
        ? op.match
        : !entityId && Object.keys(rest).length
          ? rest
          : undefined;
    return {
      operation: 'ACTION',
      action: definition.name,
      entity: actionTargetTable(handler, op.entity),
      entityId,
      ...(match && { match }),
      fields: params,
      humanReadable:
        typeof op.humanReadable === 'string' && op.humanReadable.trim()
          ? op.humanReadable.trim()
          : definition.label,
      tempId: op.tempId || `op_${index}`,
      dependsOn: op.dependsOn || [],
    };
  }

  /**
   * Détection des questions conversationnelles / culture générale.
   *
   * Deux critères complémentaires :
   * 1. Salutations, remerciements et formules courtes → CHAT direct
   * 2. Si la question NE contient AUCUN mot-clé métier du cabinet ET contient
   *    un marqueur de culture générale / conversation → CHAT
   *
   * @param normalized texte déjà normalisé (minuscules, sans accents)
   */
  private isChatIntent(normalized: string): boolean {
    // 1️⃣ Salutations et formules courtes
    if (
      /^(bonjour|bonsoir|salut|hello|hi|hey|coucou|merci|ok|d'accord|dac|ca va|bien|super|genial|cool|top|parfait|entendu|compris|c'est note|pas de souci|bonne journee|bonne soiree|a bientot|au revoir|bye|oui|non|exactement|tout a fait)[\s!.?,]*$/i.test(
        normalized,
      )
    ) {
      return true;
    }

    // 2️⃣ Vérifier l'absence de mots-clés du domaine métier
    // Si la question contient un mot-clé métier, ce n'est PAS du chat
    if (this.domainKeywordsRegex.test(normalized)) {
      return false;
    }

    // 2b. Si la question contient un pronom de suivi (celle, celui…), c'est
    // probablement une question de suivi sur des résultats précédents → pas du chat
    if (this.FOLLOW_UP_SIGNALS.test(normalized)) {
      return false;
    }

    // 3️⃣ Marqueurs de questions générales / culture générale / conversation
    const chatMarkers = [
      // Questions de culture générale
      /\b(racine\s+carree?|calcul|mathematique|physique|chimie|biologie|histoire|geographie|philosophie|science|astronomie|planete|capitale|population|superficie|distance|vitesse|temperature|formule)\b/,
      // Questions "c'est quoi / qu'est-ce que"
      /\b(c'est\s+quoi|qu'est[- ]ce\s+qu[e']|definition\s+d[eu']|signifie?|signification|veut\s+dire)\b/,
      // Demandes d'explication hors-métier
      /\b(explique|expliquer|raconte|raconter|decris|decrire|resume|resumer|traduis|traduire|convertis|convertir)\b.*\b(mot|phrase|texte|concept|notion|theorie|principe|loi\s+de|theorem|equation|reaction)\b/,
      // Questions "qui est / qui a / qui était"
      /\bqui\s+(est|etait|a\s+(invente|decouvert|cree|ecrit|fonde|gagne|remporte))\b/,
      // Questions de conversation courante
      /\b(quel\s+(?:est\s+le\s+sens|temps\s+fait|jour\s+(?:sommes|est|on\s+est)|age|heure))\b/,
      // Culture générale directe
      /\b(president|roi|reine|empereur|premier\s+ministre|secretaire\s+general)\b.*\b(de|du|des|d')\b/,
      // Demandes créatives
      /\b(ecris|ecrire|redige|rediger|compose|composer|invente|inventer)\s+(un\s+(?:poeme|texte|histoire|conte|blague|haiku|sonnet|chanson|email|mail))\b/,
      // Questions existentielles / philosophiques
      /\b(pourquoi\s+(?:le\s+ciel|la\s+terre|l'eau|les\s+etoiles|on\s+dort|on\s+reve))\b/,
      // Informatique / programmation (hors métier cabinet)
      /\b(langage|programmation|algorithme|javascript|python|java|html|css|react|angular|base\s+de\s+donnees|sql\b|api\b|code|fonction|variable|boucle|tableau)\b/,
      // Demandes de type "donne moi des elements/informations sur" + sujet non-métier
      /\b(elements?|informations?|infos?|details?|renseignements?)\s+(sur|de|du|des|d')\s+(la|le|les|l')?\s*(jurisprudence|droit\s+(?:civil|penal|commercial|international|constitutionnel|administratif|social|fiscal|du\s+travail)|code\s+(?:civil|penal)|constitution|loi|legislation|reglementation|doctrine|coutume)\b/,
      // Cuisine, sport, musique, cinéma...
      /\b(recette|cuisine|cuisinier|ingredient|sport|football|basket|tennis|musique|film|cinema|serie|livre|auteur|artiste|chanteur|acteur|peintre|sculpteur)\b/,
    ];

    if (chatMarkers.some((pattern) => pattern.test(normalized))) {
      return true;
    }

    // 4️⃣ Questions très courtes sans mot-clé métier : probablement du chat
    // ex: "comment ca marche ?", "c'est possible ?", "tu peux m'aider ?"
    const words = normalized.split(/\s+/).length;
    if (
      words <= 4 &&
      /\?$/.test(normalized.trim()) &&
      !this.domainKeywordsRegex.test(normalized)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Détection par mots-clés améliorée.
   *
   * ⚠️ IMPORTANT : Les mots-clés sont DÉJÀ normalisés (sans accents)
   * car normalizeText() supprime les accents du texte d'entrée.
   * Il faut comparer des pommes avec des pommes.
   */
  /** Demande d'écriture explicite (mots entiers, texte normalisé). */
  private readonly WRITE_VERB =
    /\b(?:cree[rz]?|ajoute[rz]?|modifie[rz]?|supprime[rz]?|enregistre[rz]?|mets?\s+a\s+jour|programme[rz]?|planifie[rz]?)\b/;

  /** Marqueurs d'une question de connaissance juridique (texte normalisé). */
  private readonly LEGAL_KNOWLEDGE =
    /\b(?:procedures?\s+(?:pour|a\s+suivre|de\s+|d')|delais?\s+(?:d'|de\s+|pour\s+)|prescription|article\s+\d+|code\s+(?:civil|penal|du\s+travail|de\s+procedure|de\s+commerce|cima|general\s+des\s+impots)|acte\s+uniforme|ohada|jurisprudence|doctrine|loi\s+(?:n|no|du|sur|relative)\b|que\s+dit\s+la\s+loi|en\s+droit\b|droit\s+(?:camerounais|francais|ohada|civil|penal|commercial|du\s+travail|administratif|foncier|de\s+la\s+famille|des\s+affaires)|qu'est[- ]ce\s+qu|c'est\s+quoi|definition|difference\s+entre|comment\s+se\s+deroule|etapes?\s+d'une?\b|conditions?\s+(?:d'|de\s+|pour\s+)|voies?\s+de\s+recours|recours\s+possibles?|est[- ]il\s+possible\s+de|a-t-on\s+le\s+droit|peut[- ]on\b|competence\s+(?:du|d'un|des)\s+(?:tribunal|juge|juridiction))/;

  /**
   * Ancrage dans les données du cabinet : possessifs, démonstratifs, numéro
   * de dossier, période ou demande de comptage. Sans ancrage, une question de
   * droit se traite avec les connaissances du modèle.
   */
  private readonly CABINET_ANCHOR =
    /\b(?:mes|mon|ma|nos|notre|ce|cet|cette|ces|du\s+cabinet|au\s+cabinet|le\s+cabinet|en\s+cours|enregistre(?:e|s|es)?|combien|liste|affiche|aujourd'hui|demain|cette\s+semaine|ce\s+mois)\b|[a-z]{2,6}[-/]?\d{2,}[-/]\d+|\bdossier\s+(?:de|du|d')\s+[a-z]/;

  private isLegalKnowledgeQuestion(text: string): boolean {
    const normalized = text.replace(/[’`]/g, "'");
    if (!this.LEGAL_KNOWLEDGE.test(normalized)) return false;
    // « qu'est-ce que » contient « ce » : retiré avant de chercher un ancrage.
    const withoutIdioms = normalized.replace(/qu'est[- ]ce\s+qu[e']?|est[- ]ce\s+qu[e']?/g, ' ');
    return !this.CABINET_ANCHOR.test(withoutIdioms);
  }

  private isHelpIntent(question: string): boolean {
    const normalized = this.normalizeText(question);
    const patterns = [
      /comment\s+(?:faire|creer|ajouter|modifier|supprimer)/,
      /ou\s+cliquer/,
      /explique.*(?:creer|ajouter|modifier|supprimer)/,
      // « procédure pour contester un licenciement » est une question de
      // droit (connaissances), pas une aide à l'utilisation de l'application.
      /(?:procedure|guide)\s+pour\s+(?:creer|ajouter|modifier|supprimer|enregistrer|saisir|importer|exporter|configurer|parametrer|utiliser|generer|imprimer|envoyer|facturer|cloturer|archiver)/,
    ];

    if (patterns.some((pattern) => pattern.test(normalized))) return true;
    return this.isDocumentedUsageQuestion(question);
  }

  /**
   * « Comment fonctionne la paie ? », « c'est quoi un élément facturable ? » :
   * questions d'usage dont le sujet est un module documenté dans `help-docs/`.
   * Le sujet doit correspondre à une documentation, sinon la question reste
   * une question de droit ou de données (« qu'est-ce qu'une assignation ? »).
   */
  private isDocumentedUsageQuestion(question: string): boolean {
    const { question: asked } = splitPageContext(question);
    const text = normalizeHelpText(asked);
    if (!text || this.DOSSIER_REFERENCE.test(text)) return false;

    if (this.HOW_IT_WORKS.test(text)) {
      return matchHelpDocs(question, { limit: 1, minScore: 1 }).length > 0;
    }
    if (this.WHAT_IS_IT.test(text)) {
      // Expression précise exigée (poids >= 3) : « facture » seul est trop courant.
      return matchHelpDocs(question, { limit: 1, minScore: 3 }).length > 0;
    }
    return false;
  }

  private readonly HOW_IT_WORKS =
    /\bcomment\s+(?:ca\s+|cela\s+)?(?:fonctionne|marche)\b|\bfonctionnement\s+(?:du|de\s+la|de\s+l'|des)\b|\bcomment\s+(?:puis-je\s+|peut-on\s+|dois-je\s+|doit-on\s+|on\s+|je\s+)?(?:utiliser|configurer|parametrer|generer|emettre|facturer|cloturer|enregistrer|saisir|payer|rembourser|valider|approuver|calculer|declarer|ouvrir|etablir|regler|renseigner|activer|lancer|consulter|retrouver)\b|\bpar\s+ou\s+commencer\b/;

  private readonly WHAT_IS_IT =
    /\bc'est\s+quoi\b|\bqu'est[- ]ce\s+qu(?:e|')|\ba\s+quoi\s+(?:sert|servent)\b|\bexplique(?:-moi|z-moi)?\b|\bque\s+(?:signifie|veut\s+dire)\b|\bdifference\s+entre\b|\bprerequis\b|\bavant\s+de\s+(?:creer|facturer|commencer)\b/;

  private readonly DOSSIER_REFERENCE = /\b[a-z]{2,6}-\d{4}-\d+\b/;

  private isAdviceIntent(question: string): boolean {
    const normalized = this.normalizeText(question);
    const patterns = [
      /\bconseil(?:le|ler|s)?\b/,
      /\brecommand(?:e|er|ation|ations)\b/,
      /\bsuggestions?\b/,
      /\bproposes?\b/,
      /\bidees?\b/,
      /\bquoi\s+ajouter\b/,
      /\bque\s+(?:peux|peut|pourrais|pourrait)[-\s]*tu\s+me\s+conseil/,
      /\bque\s+(?:me\s+)?(?:conseilles?|recommandes?)[-\s]*tu\b/,
      /\bque\s+manque\b/,
      /\bqu(?:e|oi)\s+(?:ameliorer|optimiser)\b/,
      /\b(?:ajouter|ajjouter)\s+encore\b/,
      /\bprochaine?s?\s+etapes?\b/,
    ];

    return patterns.some((pattern) => pattern.test(normalized));
  }

  private isWriteIntent(question: string): boolean {
    const normalized = this.normalizeText(question);

    // ✅ Mots-clés SANS accents (car normalizeText supprime les accents)
    const strongWriteKeywords = [
      'cree',
      'creer',
      'creation',
      'nouveau',
      'nouvelle',
      'ajoute',
      'ajouter',
      'ajout',
      'ajoute',
      'modifie',
      'modifier',
      'modification',
      'modifie',
      'supprime',
      'supprimer',
      'suppression',
      'supprime',
      'enregistre',
      'enregistrer',
      'enregistre',
      'ouvre',
      'ouvrir',
      'ferme',
      'fermer',
      'ferme',
      'archive',
      'archiver',
      'archive',
      'cloture',
      'cloturer',
      'cloture',
      'assigne',
      'assigner',
      'assigne',
      'attribue',
      'attribuer',
      'attribue',
      'mettre a jour',
      'mise a jour',
      'met a jour',
      'changer',
      'change',
      'inserer',
      'insere',
      'insertion',
      // Vocabulaire comptable (création/modification d'écritures, comptes, journaux…)
      'comptabilise',
      'comptabiliser',
      'passe une ecriture',
      'passer une ecriture',
      'passe ecriture',
      'saisis une ecriture',
      'saisir une ecriture',
      'saisis',
      'saisir',
      'saisie',
      'debite',
      'debiter',
      'crediter',
      'credite',
      'lettrer',
      'lettrage',
      'rapproche',
      'rapprocher',
    ];

    for (const keyword of strongWriteKeywords) {
      if (normalized.includes(keyword)) {
        this.logger.debug(
          `🔍 Mot-clé WRITE détecté: "${keyword}" dans "${normalized.substring(0, 60)}..."`,
        );
        return true;
      }
    }

    // ✅ Patterns avancés (testés sur le texte NORMALISÉ, sans accents)
    const patterns = [
      /je\s+(?:veux|souhaite|voudrais)\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /peux-tu\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /pourrais-tu\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /j'aimerais\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /il\s+faut\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      /(?:merci de|veuillez)\s+(?:creer|ajouter|modifier|supprimer|enregistrer)/,
      // Patterns d'analyse structurée avec données brutes → intent WRITE implicite
      /INSTRUCTION\s*:/i,
      /DONNEES\s+BRUTES/i,
      /fiche\s+(?:de\s+synthese|synthetique)/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        this.logger.debug(`🔍 Pattern WRITE détecté: ${pattern}`);
        return true;
      }
    }

    // Envoi d'une facture, relance… (actions du chat).
    if (this.SEND_VERB.test(normalized) && this.actionRegistry?.all().length) {
      return true;
    }

    return false;
  }

  /**
   * Classification légère via LLM.
   *
   * Un seul appel court (prompt ~300 tokens, réponse 1 mot) qui distingue
   * READ / WRITE / CHAT de façon fiable, sans avoir besoin de heuristiques fragiles.
   *
   * Appelé uniquement quand `isWriteIntent()` n'a pas trouvé de mots-clés évidents,
   * donc pas de surcoût pour les WRITE évidents.
   */
  private async lightClassify(
    question: string,
    llm: ChatOpenAI,
    options: {
      onLlmCall?: (info: {
        profile: 'fast' | 'quality';
        input: unknown;
        modelName?: string;
      }) => void;
      classifierModelName?: string;
      history?: string;
      signals?: SourceSignals;
      skillCandidates?: SkillCandidate[];
      allowComposite?: boolean;
    } = {},
  ): Promise<LightClassification> {
    const signalsBlock = options.signals ? describeSignals(options.signals) : '';
    const candidates = (options.skillCandidates ?? []).slice(0, 3);
    // La même phrase n'a pas le même sens dans une autre conversation
    // (« et celle-ci ? ») : l'historique et les indices font partie de la clé.
    const cacheKey = [
      this.normalizeText(question).trim(),
      options.history ?? '',
      signalsBlock,
      candidates.map((candidate) => candidate.code).join(','),
      options.allowComposite ? '+' : '',
    ].join('\n');
    const cached = this.classificationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    // Inclure l'historique récent pour que le LLM comprenne les questions
    // de suivi ("celle qui est payée", "le dernier", "parmi ceux-là"…)
    const historyBlock = options.history
      ? `\nHistorique récent de la conversation :\n${options.history}\n`
      : '';

    const prompt = `Tu es un classificateur pour un assistant IA de cabinet d'avocats.
Classe la demande suivante en UN SEUL MOT parmi : READ, WRITE, HELP, ADVICE, CHAT.

READ   = interroger des données existantes (lister, chercher, afficher, compter, montrer, combien, quels, qui, quel dossier...). Inclut aussi les QUESTIONS DE SUIVI qui font référence à des résultats précédents avec des pronoms ("celle qui...", "le dernier", "parmi ceux-là", "donne moi celle qui est payée").
WRITE  = créer, modifier ou supprimer des données (créer, ajouter, enregistrer, ouvrir un dossier, modifier, supprimer, corriger, rectifier, réparer, renommer, fusionner, appliquer, AINSI QUE les opérations comptables : passer/saisir/comptabiliser une écriture, débiter, créditer, créer un compte ou un journal, ouvrir/clôturer un exercice...)
HELP   = expliquer comment utiliser l'application, ou guider l'utilisateur dans une procédure (comment faire, comment créer, où cliquer, procédure pour, guide pour). Une demande "comment créer..." est HELP, pas WRITE.
ADVICE = donner des conseils, recommandations, suggestions, pistes d'amélioration ou prochaines étapes, souvent à partir du contexte précédent. Une demande "que peux-tu me conseiller d'ajouter encore ?" est ADVICE, pas READ.
CHAT   = question à laquelle on répond avec ses CONNAISSANCES, sans les données du cabinet : salutation, remerciement, culture générale, ET questions de DROIT générales (délais, procédures, voies de recours, conditions, définitions, textes de loi, OHADA, jurisprudence, rédaction d'un modèle de courrier ou d'acte, stratégie dans l'abstrait).
⚠️ READ seulement si la réponse exige des enregistrements du cabinet (un dossier, un client, des audiences, des chiffres du cabinet). « Quels sont les délais d'appel au Cameroun ? » est CHAT ; « quelles audiences ont lieu demain ? » est READ.

Contexte du cabinet : dossiers juridiques, clients, avocats, factures, audiences, paiements, diligences, ET comptabilité (écritures comptables, comptes du plan comptable, journaux, exercices).
⚠️ « passer une écriture », « comptabiliser », « saisir une écriture » sont des opérations WRITE (création d'une écriture comptable), jamais READ.
⚠️ Si l'utilisateur demande d'AGIR sur des anomalies, points d'attention ou recommandations déjà évoqués dans la conversation (« corrige-les », « corrige les points d'attention », « fais-le », « applique »), c'est WRITE, jamais ADVICE : ADVICE est réservé aux demandes de conseil sans action.
⚠️ Si l'utilisateur fait référence à un résultat précédent (« celle-ci », « celui-là », « la première », « parmi ceux-là ») en lien avec des données du cabinet, c'est READ, pas CHAT.
${historyBlock}${
      signalsBlock
        ? `
Indices calculés sur la demande (fiables) :
${signalsBlock}
`
        : ''
    }
${candidates.length ? `
Compétences du chat qui pourraient répondre (actions spécialisées qui préparent un brouillon ou un calcul, toujours validé par l'utilisateur) :
${candidates.map((candidate) => `- ${candidate.code} : ${candidate.label} — ${candidate.description}`).join('\n')}
Si la demande demande de RÉALISER l'une de ces actions (préparer, rédiger, envoyer, calculer, analyser… pour un client, un dossier ou un document du cabinet), réponds SKILL:<code> (ex. SKILL:${candidates[0].code}). Une simple question de connaissance (« quel est le délai d'appel ? ») reste CHAT ; une consultation des données reste READ.
${candidates.some((candidate) => candidate.code === TEMPLATE_SKILLS.produce || candidate.code === TEMPLATE_SKILLS.manage) ? `⚠️ Une demande qui porte sur un MODÈLE du cabinet (modèle de document, de facture, de mail, gabarit, template, « ce modèle » cité plus tôt dans l'historique) n'est jamais READ : les modèles ne sont pas des données à lister en SQL. Pour produire un document à partir d'un modèle (« rédige un document sur la base de ce modèle facture client »), réponds SKILL:${TEMPLATE_SKILLS.produce} ; pour chercher, lister, lire ou modifier le modèle lui-même, réponds SKILL:${TEMPLATE_SKILLS.manage}.
` : ''}` : ''}${options.allowComposite ? `
Si la demande enchaîne EXPLICITEMENT deux demandes de natures différentes (reliées par « et », « puis », « ensuite »), réponds leurs types dans l'ordre, reliés par « + » (ex. HELP+READ${candidates.length ? `, READ+SKILL:${candidates[0].code}` : ''}). Une seule demande, même longue : un seul type.
` : ''}
Demande : "${question.replace(/"/g, "'")}"

Réponds UNIQUEMENT avec READ, WRITE, HELP, ADVICE ou CHAT${candidates.length ? ' (ou SKILL:<code>)' : ''}. Rien d'autre.
Si la demande est ambiguë — quelques mots sans verbe ni contexte (« rapport », « la TVA »), ou pouvant viser aussi bien les données du cabinet qu'une question générale ou l'utilisation de l'application — réponds les deux types les plus probables séparés par « | », le plus probable d'abord (ex. READ|CHAT). Si le sens est clair (y compris grâce à l'historique), un seul mot.`;

    try {
      const input = [{ role: 'user', content: prompt }];
      options.onLlmCall?.({
        profile: 'fast',
        input,
        modelName: options.classifierModelName,
      });
      const response = await llm.invoke(input);
      const result = parseLightClassification(this.extractLlmText(response).trim());
      if (!result) {
        // Réponse vide (budget de tokens épuisé par la réflexion du modèle)
        // ou illisible (raisonnement en prose) : repli selon les indices, sans
        // le mettre en cache. Sans indice net, le chat demande le mode plutôt
        // que de deviner.
        const fallback = this.fallbackClass(options.signals);
        this.logger.warn(`🏷️ Classification vide ou illisible → ${fallback} par défaut`);
        const signals = options.signals;
        return signals && !isKnowledgeQuestion(signals) && !isAnchoredInCabinet(signals)
          ? { value: fallback, alternative: fallback === 'CHAT' ? 'READ' : 'CHAT' }
          : { value: fallback };
      }
      this.classificationCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch {
      // Classifieur injoignable : SQL seulement si la question peut viser le cabinet.
      return { value: this.fallbackClass(options.signals) };
    }
  }

  /**
   * Classe retenue quand le classifieur ne répond pas : une question de droit
   * ou générale sans lien avec le cabinet reçoit une réponse de connaissance
   * plutôt qu'une requête SQL vide (« aucune donnée »).
   */
  private fallbackClass(signals?: SourceSignals): IntentClass {
    return signals && isUnlikelyDatabaseQuestion(signals) ? 'CHAT' : 'READ';
  }

  /**
   * Indices locaux sur les sources à mobiliser (données du cabinet, base
   * juridique, connaissances du modèle). Purement local : quelques regex et
   * le classement lexical déjà fait de la base juridique.
   */
  public computeSourceSignals(
    question: string,
    legalMatches: LegalKnowledgeMatch[] = [],
  ): SourceSignals {
    const { question: asked, pathname } = splitPageContext(question);
    const normalized = this.normalizeText(asked).replace(/[’`]/g, "'");
    // « qu'est-ce que » contient « ce » : retiré avant de chercher un ancrage.
    const withoutIdioms = normalized.replace(
      /qu'est[- ]ce\s+qu[e']?|est[- ]ce\s+qu[e']?/g,
      ' ',
    );
    return {
      recordReference: extractRecordReference(asked),
      cabinetAnchor: this.CABINET_ANCHOR.test(withoutIdioms),
      followUp: this.FOLLOW_UP_SIGNALS.test(normalized),
      domainKeyword: this.domainKeywordsRegex.test(normalized),
      legalMarkers: this.LEGAL_KNOWLEDGE.test(normalized),
      writeVerb: this.WRITE_VERB.test(normalized),
      legalKb: summarizeLegalMatches(legalMatches),
      ...(pathname && { pathname }),
    };
  }

  /**
   * Génère une réponse directe pour les questions conversationnelles.
   * Le prompt système est fourni par projectConfig.conversationalSystemPrompt (logique métier externe).
   * Un prompt générique est utilisé si aucune config n'est fournie.
   */
  private async generateConversationalResponse(
    question: string,
    llm: ChatOpenAI,
  ): Promise<string> {
    const systemPrompt =
      this.projectConfig?.conversationalSystemPrompt ??
      `Tu es un assistant IA. Réponds aux questions générales et aux salutations de façon courtoise et professionnelle.`;

    try {
      const response = await llm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ]);
      return this.extractLlmText(response);
    } catch {
      return `Bonjour ! Comment puis-je vous aider ?`;
    }
  }

  /**
   * Extrait le texte d'une réponse LLM, quel que soit son format (string ou
   * tableau de blocs, cas des modèles "thinking"). Sans ça, `response.content
   * as string` plante silencieusement sur un tableau et le catch avale
   * l'erreur → fallback READ inattendu, y compris en mode WRITE forcé.
   */
  private extractLlmText(response: any): string {
    const content = response?.content ?? response;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item: any) => item?.text ?? item?.content ?? item ?? '')
        .join('');
    }
    return String(content ?? '');
  }

  /**
   * Normalise le texte (minuscules, sans accents)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae');
  }

  /**
   * Parse la réponse JSON
   */
  private parseResponse(content: string): any {
    // Nettoyer le contenu
    let clean = content.trim();

    // Enlever les balises code
    clean = clean.replace(/```json\s*/g, '');
    clean = clean.replace(/```\s*/g, '');

    // Extraire le JSON (au cas où il y aurait du texte autour)
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }

    return JSON.parse(clean);
  }
}
