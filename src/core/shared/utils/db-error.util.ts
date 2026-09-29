/**
 * Détection des erreurs de contrainte d'unicité renvoyées par le driver MySQL.
 *
 * TypeORM remonte l'erreur native soit à plat, soit encapsulée dans
 * `driverError` selon le chemin (save / query builder / transaction), d'où la
 * vérification des quatre emplacements possibles.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    errno?: number;
    driverError?: { code?: string; errno?: number };
  };
  return (
    candidate?.code === 'ER_DUP_ENTRY' ||
    candidate?.errno === 1062 ||
    candidate?.driverError?.code === 'ER_DUP_ENTRY' ||
    candidate?.driverError?.errno === 1062
  );
}
