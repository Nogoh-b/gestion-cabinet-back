import { ResolveConfig, ResolveResult } from '../write/entity-resolver.service';

/**
 * Resolver spécialisé pour une ou plusieurs tables.
 * Implémenté dans le projet, injecté dans EntityResolverService via le token AI_DATABASE_PROJECT_CONFIG.
 */
export interface SpecializedEntityResolver {
  /** Noms de tables gérés par ce resolver (ex: ['customer', 'customers']) */
  readonly tables: string[];
  /** Résout un terme de recherche vers des entités */
  resolve(term: string, config?: ResolveConfig): Promise<ResolveResult<any>>;
}

export interface ReadClarificationOption {
  id: string;
  label: string;
  description: string;
  followUpQuestion: string;
  specificTables?: string[];
}

export interface ReadClarificationPreset {
  id: string;
  keywords: string[];
  reason: string;
  question: string;
  options: ReadClarificationOption[];
}

/**
 * Configuration projet injectée dans le module AiDatabase.
 * Fournie par AiDatabaseProjectModule (src/config/ai-database/).
 * Le module core fonctionne sans cette config (tout est optionnel).
 */
export interface AiDatabaseProjectConfig {
  /**
   * Resolvers spécialisés qui remplacent la résolution générique pour certaines tables.
   * Ex: un resolver Customer qui fait des recherches phonétiques sur prénom+nom.
   */
  specializedResolvers?: SpecializedEntityResolver[];

  /**
   * Tables que le système ne doit JAMAIS créer automatiquement (données de référence, entités sensibles).
   * S'ajoute à la liste minimale du core (user, users).
   */
  neverAutoCreate?: string[];

  /**
   * Règles métier supplémentaires injectées dans le prompt IA.
   * Texte Markdown. Inséré après les règles génériques.
   */
  promptDomainRules?: string;

  /**
   * Règles métier spécifiques aux lectures SQL (READ).
   * Le core les injecte dans les prompts SQL sans connaître leur contenu.
   */
  readDomainRules?: string;

  /**
   * Presets de clarification READ fournis par le projet.
   * Utilises quand une question READ genere une requete vide synthetique.
   */
  readClarificationPresets?: ReadClarificationPreset[];

  /**
   * Exemple complet de plan write JSON pour guider l'IA sur le domaine métier.
   * Remplace l'exemple générique dans le prompt.
   */
  promptDomainExample?: string;

  /**
   * Prompt système injecté dans le LLM pour les réponses conversationnelles (questions hors-BD).
   * Si absent, un prompt générique est utilisé.
   * Ex: "Tu es l'assistant IA d'un cabinet d'avocats. Réponds de façon professionnelle..."
   */
  conversationalSystemPrompt?: string;

  /**
   * Prompt système pour l'analyse métier des résultats SQL (READ).
   * Injecté au début du prompt d'analyse. Si absent, un prompt générique est utilisé.
   * Ex: "Tu es un expert métier spécialisé dans la gestion de dossiers juridiques..."
   */
  analysisSystemPrompt?: string;

  /**
   * Labels lisibles pour les noms de champs (utilisés dans les messages d'ambiguïté).
   * Ex: { 'procedure_type': 'type de procédure', 'lawyer': 'avocat référent' }
   */
  fieldLabels?: Record<string, string>;

  /**
   * Configuration des tables visibles pour l'analyse IA.
   */
  databaseTablesConfig?: {
    essentialTables?: string[];
    ignoredTables?: string[];
    sampling?: { sampleRows: number; maxStringLength: number };
    tableDescriptions?: Record<string, string>;
    tableSynonyms?: Record<string, string[]>;
  };
}
