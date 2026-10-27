/**
 * Le mot de passe SMTP du cabinet ne quitte jamais le serveur : l'API renvoie
 * ce masque à la place, et un masque (ou une valeur vide) reçu en écriture
 * signifie « mot de passe inchangé ».
 */
export const SMTP_PASSWORD_MASK = '••••••••';

type SmtpConfigLike = object | null | undefined;

/** Copie de la configuration SMTP dont le mot de passe est masqué. */
export function maskSmtpConfig(config: SmtpConfigLike): object | null {
  if (!config || typeof config !== 'object') return null;
  const masked: Record<string, unknown> = { ...(config as object) };
  // `password` : ancien nom du champ, par prudence.
  for (const key of ['pass', 'password']) {
    if (typeof masked[key] === 'string' && masked[key] !== '') {
      masked[key] = SMTP_PASSWORD_MASK;
    }
  }
  return masked;
}

/**
 * Configuration SMTP à enregistrer : un mot de passe absent, vide ou masqué
 * conserve celui déjà stocké au lieu de l'écraser.
 */
export function mergeSmtpConfig(
  incoming: SmtpConfigLike,
  stored: SmtpConfigLike,
): object | null {
  if (incoming === null || incoming === undefined) return null;
  const merged: Record<string, unknown> = { ...(incoming as object) };
  const previous = (
    stored && typeof stored === 'object' ? stored : {}
  ) as Record<string, unknown>;
  const isUnchanged = (value: unknown) =>
    value === undefined ||
    value === null ||
    value === '' ||
    value === SMTP_PASSWORD_MASK;
  for (const key of ['pass', 'password']) {
    if (isUnchanged(merged[key])) {
      if (previous[key] !== undefined) merged[key] = previous[key];
      else delete merged[key];
    }
  }
  return merged;
}
