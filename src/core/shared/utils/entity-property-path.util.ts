import { EntityMetadata } from 'typeorm';

const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Vérifie qu'un chemin se termine par une vraie colonne TypeORM.
 *
 * Exemples valides :
 * - name
 * - customer.company_name
 * - dossier.client.last_name
 */
export function isEntityColumnPath(
  metadata: EntityMetadata,
  propertyPath?: string,
): boolean {
  if (!propertyPath) {
    return false;
  }

  const segments = propertyPath.split('.');
  if (
    segments.some((segment) => !segment || FORBIDDEN_PATH_SEGMENTS.has(segment))
  ) {
    return false;
  }

  // Les colonnes embarquées peuvent elles-mêmes avoir un propertyPath pointé.
  if (metadata.hasColumnWithPropertyPath(propertyPath)) {
    return true;
  }

  let currentMetadata = metadata;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const relation = currentMetadata.findRelationWithPropertyPath(
      segments[index],
    );

    if (!relation) {
      return false;
    }

    currentMetadata = relation.inverseEntityMetadata;
  }

  return currentMetadata.hasColumnWithPropertyPath(
    segments[segments.length - 1],
  );
}

export function getDefaultSortColumn(
  metadata: EntityMetadata,
): string | undefined {
  if (isEntityColumnPath(metadata, 'created_at')) {
    return 'created_at';
  }

  return metadata.primaryColumns[0]?.propertyPath;
}
