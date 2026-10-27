/**
 * Date du jour donnée aux prompts de l'assistant. Sans elle, le modèle répond
 * qu'il n'a pas accès à la date. Le fuseau par défaut est celui des cabinets
 * français ; le calcul se fait à chaque requête, jamais dans un prompt mis en cache.
 */
export const PROMPT_DEFAULT_TIME_ZONE = 'Europe/Paris';

export function buildCurrentDateLine(now = new Date(), timeZone = PROMPT_DEFAULT_TIME_ZONE): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  const longDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const isoDate = new Intl.DateTimeFormat('fr-CA', { timeZone: zone }).format(now);
  return `Date du jour : ${longDate} (${isoDate}, fuseau ${zone}). Tu connais cette date : utilise-la si on te la demande ou pour calculer un délai.`;
}

export function withCurrentDate(prompt: string, now = new Date()): string {
  return `${prompt}\n\n${buildCurrentDateLine(now)}`;
}
