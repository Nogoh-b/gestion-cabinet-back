/**
 * EntityIdRequiredException — levée quand une opération UPDATE/DELETE n'a
 * pas d'entityId (ex: l'utilisateur dit "marque-la comme reportée" sans
 * jamais avoir donné d'identifiant explicite, et l'historique ne permet pas
 * de le déduire).
 *
 * Remplace le simple BadRequestException pour permettre à AiDatabaseService
 * de garder le plan en mémoire (au lieu de le perdre) et de demander une
 * précision à l'utilisateur, exactement comme pour AmbiguityException.
 *
 * Cycle de vie :
 *  1. BaseWriteHandler.execute()         → entityId manquant → lève cette exception
 *  2. GenericWriteService.executePlan()  → catch → re-lève avec operationIndex
 *  3. AiDatabaseService                  → catch → mémorise le plan (par conversationId)
 *                                           et demande l'identifiant à l'utilisateur
 *  4. Au message suivant dans la même conversation, AiDatabaseService tente
 *     d'extraire un identifiant numérique de la réponse et relance le plan.
 */
export class EntityIdRequiredException extends Error {
  readonly name = 'EntityIdRequiredException';

  constructor(
    /** Nom de la table TypeORM concernée (ex: "audiences") */
    public readonly entity: string,
    /**
     * Index de l'opération dans le WritePlan (0-based).
     * Initialement -1, rempli par GenericWriteService au catch.
     */
    public operationIndex: number = -1,
  ) {
    super(`ID requis pour UPDATE sur ${entity}`);
  }
}
