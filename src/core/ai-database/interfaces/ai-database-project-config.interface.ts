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
   * Exemple complet de plan write JSON pour guider l'IA sur le domaine métier.
   * Remplace l'exemple générique dans le prompt.
   */
  promptDomainExample?: string;

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
  };
}
