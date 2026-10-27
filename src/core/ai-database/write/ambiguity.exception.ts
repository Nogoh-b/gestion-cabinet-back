/**
 * AmbiguityException — lancée quand EntityResolverService détecte plusieurs
 * candidats proches pour un terme de recherche.
 *
 * Remplace BadRequestException pour permettre au controller de distinguer
 * "erreur fatale" de "ambiguïté nécessitant un choix utilisateur".
 *
 * Cycle de vie :
 *  1. BaseWriteHandler.resolveDependencies() → détecte l'ambiguïté → lève cette exception
 *  2. GenericWriteService.executePlan()     → catch → re-lève avec operationIndex
 *  3. AiDatabaseService.analyzeQuestion()   → catch → retourne requiresAmbiguityResolution: true
 *  4. Frontend affiche les choix → POST /write/resolve-ambiguity
 *  5. AiDatabaseService.resumeAfterAmbiguity() → injecte l'ID choisi → relance executePlan
 */
/**
 * `fieldName` réservé : l'ambiguïté porte sur l'enregistrement à MODIFIER (UPDATE
 * sans identifiant), pas sur une clé étrangère. Le choix renseigne `entityId`.
 */
export const UPDATE_TARGET_FIELD = '__target__';

/**
 * Candidat spécial d'une ambiguïté UPDATE_TARGET_FIELD : appliquer la
 * modification à tous les enregistrements correspondants (`op.all`).
 */
export const ALL_MATCHING_TARGETS = '__all__';

export interface AmbiguityCandidate {
  /** ID de l'entité en base */
  id: string | number;
  /** Libellé affiché à l'utilisateur (ex: "Jean Dupont — prénom+nom") */
  label: string;
  /** Score de similarité (0–100) */
  score: number;
  /** Objet entité complet (pour affichage détaillé côté front) */
  data: any;
}

export class AmbiguityException extends Error {
  readonly name = 'AmbiguityException';
  /**
   * Choix de la cible (UPDATE_TARGET_FIELD) : élément à modifier, ou élément
   * visé par une action (envoi…), pour le libellé de la question.
   */
  purpose: 'update' | 'action' = 'update';

  constructor(
    /** Nom de la table TypeORM référencée (ex: "customer") */
    public readonly entity: string,
    /** Alias FK dans les champs (ex: "client") */
    public readonly fieldName: string,
    /** Valeur textuelle qui a déclenché l'ambiguïté (ex: "Jean Dupont") */
    public readonly searchTerm: string,
    /** Candidats classés par score décroissant */
    public readonly candidates: AmbiguityCandidate[],
    /**
     * Index de l'opération dans le WritePlan (0-based).
     * Initialement -1, rempli par GenericWriteService au catch.
     */
    public operationIndex: number = -1,
    /**
     * Entité en cours d'écriture au moment de l'ambiguïté (ex: "dossiers").
     * Permet au front d'afficher : "La création d'un dossier nécessite un client."
     */
    public readonly parentEntity?: string,
  ) {
    super(
      candidates.length > 0
        ? `Ambiguïté: "${searchTerm}" correspond à ${candidates.length} entités dans "${entity}". Veuillez choisir parmi les propositions.`
        : `Aucune correspondance trouvée pour "${searchTerm}" dans "${entity}". Veuillez vérifier l'orthographe ou fournir plus de détails.`,
    );
  }
}
