import { BadRequestException } from '@nestjs/common';

/**
 * Candidat "créer quand même avec un nouveau numéro automatique" proposé
 * quand le numéro de dossier lu dans un document est déjà pris par un dossier
 * actif. Même principe que ALL_MATCHING_TARGETS pour les mises à jour groupées.
 */
export const DOSSIER_NUMBER_AUTO_CHOICE = '__auto__';

/** Champ interne : réutiliser ce dossier existant au lieu de créer un doublon. */
export const REUSE_DOSSIER_ID_FIELD = '__reuse_dossier_id';

/**
 * Applique le choix de l'utilisateur après un conflit de numéro de dossier :
 * - resolvedId = ID d'un dossier existant → le réutiliser (pas de doublon) ;
 * - resolvedId = DOSSIER_NUMBER_AUTO_CHOICE → numéro auto-généré ;
 * - customValue (option "Autre") → le numéro précis saisi par l'utilisateur.
 */
export function applyDossierNumberChoice(
  fields: Record<string, any>,
  resolvedId: string | number | undefined,
  customValue: string | undefined,
): { fields: Record<string, any>; note: string } {
  const out = { ...fields };
  delete out[REUSE_DOSSIER_ID_FIELD];
  if (
    resolvedId !== undefined &&
    resolvedId !== null &&
    String(resolvedId) !== ''
  ) {
    if (String(resolvedId) === DOSSIER_NUMBER_AUTO_CHOICE) {
      delete out.dossier_number;
      return {
        fields: out,
        note: 'création avec un nouveau numéro automatique',
      };
    }
    out[REUSE_DOSSIER_ID_FIELD] = resolvedId;
    return { fields: out, note: 'dossier existant réutilisé' };
  }
  const typed = customValue?.trim() ?? '';
  if (!typed) {
    throw new BadRequestException(
      'Choisissez le dossier existant, un numéro automatique, ou saisissez un numéro libre.',
    );
  }
  out.dossier_number = typed;
  return { fields: out, note: `numéro « ${typed} » demandé` };
}
