export class AnalysisResponseDto {
  success: boolean = true;
  question: string = '';
  sqlQuery?: string;
  schema?: any;
  schemaJSON?: any;
  rawResults?: any[];
  analysis: string = '';
  tokensUsed?: number;
  results?: any;
  pendingWrite?: any;
  requiresConfirmation?: boolean;
  conversationId?: any;
  rowCount?: any;
  executionTimeMs: number = 1;
  recommendations?: string[];
  error?: string;
  pendingWritePlan?: WritePlan;

  /**
   * Ensembles de résultats multiples, un par ressource, quand la question
   * portait sur plusieurs ressources (ex: un client + ses dossiers + ses factures).
   * Le frontend affiche un tableau étiqueté par ensemble. `results`/`sqlQuery`
   * restent renseignés (premier ensemble + requêtes concaténées) pour rétro-compat.
   */
  resultSets?: Array<{
    title: string;
    sqlQuery: string;
    data: any[];
    rowCount: number;
  }>;

  /**
   * true quand une demande READ est trop ambigue ou incomprise pour generer
   * une requete fiable. Le frontend doit afficher les options de clarification.
   */
  requiresClarification?: boolean;
  clarificationContext?: ReadClarificationContext;

  // ── Ambiguïté de résolution ───────────────────────────────────────────────
  /**
   * true quand l'IA ne peut pas choisir seule parmi plusieurs entités.
   * Le frontend doit afficher `ambiguityContext.candidates` et renvoyer
   * POST /api/ai-database/write/resolve-ambiguity avec l'ID choisi.
   */
  requiresAmbiguityResolution?: boolean;
  ambiguityContext?: {
    entity: string;
    fieldName: string;
    searchTerm: string;
    candidates: Array<{ id: any; label: string; score: number; data?: any }>;
    /** Index de l'opération dans le WritePlan à reprendre */
    operationIndex: number;
    /** Entité en cours de création au moment de l'ambiguïté (ex: "dossiers") */
    parentEntity?: string;
    /**
     * true → le frontend peut proposer une option « Autre » quand aucun
     * candidat ne convient. L'utilisateur saisit un texte libre (customValue)
     * envoyé à POST resolve-ambiguity pour créer l'entité ou relancer la résolution.
     */
    allowOther?: boolean;
    /** Libellé lisible de l'entité cible (ex: "juridiction", "type de procédure") */
    otherLabel?: string;
  };
}

export interface ReadClarificationOption {
  id: string;
  label: string;
  description: string;
  followUpQuestion: string;
  specificTables?: string[];
}

export interface ReadClarificationContext {
  reason: string;
  question: string;
  options: ReadClarificationOption[];
}

export interface WritePlan {
  transaction: boolean;
  operations: WriteOperation[];
  humanReadable: string;
  confidence: number;
}

export interface WriteOperation {
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ACTION';
  entity: string;
  /**
   * ACTION : action métier à déclencher (« envoyer_facture »…, cf.
   * AiActionRegistry) sur l'enregistrement visé ; `fields` porte ses paramètres.
   */
  action?: string;
  entityId?: string | number;
  /**
   * UPDATE sans identifiant connu : valeurs ACTUELLES des colonnes qui désignent
   * l'enregistrement (ex: { start_date, end_date, label }). Résolu en entityId à
   * l'exécution ; 0 ou plusieurs correspondances → précision demandée à l'utilisateur.
   */
  match?: Record<string, any>;
  /**
   * UPDATE avec `match` : appliquer `fields` à TOUS les enregistrements
   * correspondants (« passe toutes les audiences du dossier à… »).
   */
  all?: boolean;
  fields: Record<string, any>;
  tempId?: string;
  dependsOn?: string[];
  humanReadable: string; // Description lisible pour confirmation
  /**
   * Ancienne configuration de résolution, gardée pour les plans enregistrés.
   * Sans effet : les références sont résolues de façon déterministe
   * (identifiant, ou correspondance exacte et unique, sinon choix utilisateur).
   */
  resolveConfig?: {
    mode?: 'strict' | 'best_effort';
    minScore?: number;
    ambiguityGap?: number;
  };
}
