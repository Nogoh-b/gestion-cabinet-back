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

  constructor(
    /** Nom de la table TypeORM (ex: "customer") */
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
  ) {
    super(
      `Ambiguïté: "${searchTerm}" correspond à ${candidates.length} entités dans "${entity}". ` +
      `Veuillez choisir parmi les propositions.`,
    );
  }
}
