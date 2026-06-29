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
  resultSets?: Array<{ title: string; sqlQuery: string; data: any[]; rowCount: number }>;

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
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId?: string | number;
  fields: Record<string, any>;
  tempId?: string;
  dependsOn?: string[];
  humanReadable: string;    // Description lisible pour confirmation
  /**
   * Configuration de résolution des dépendances pour cette opération.
   * Permet de contrôler comment les références (FK) sont résolues :
   * - strict : (défaut) bloque en cas d'ambiguïté
   * - best_effort : prend automatiquement le meilleur score
   */
  resolveConfig?: {
    mode?: 'strict' | 'best_effort';
    minScore?: number;
    ambiguityGap?: number;
  };
}
