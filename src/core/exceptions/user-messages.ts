/**
 * Messages d'erreur renvoyés aux utilisateurs : toujours en français, jamais
 * de détail technique (SQL, pile, anglais du framework).
 */

export const STATUS_MESSAGES: Record<number, string> = {
  400: 'Certaines informations sont invalides. Vérifiez le formulaire puis réessayez.',
  401: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  403: "Vous n'avez pas les droits nécessaires pour cette action.",
  404: "L'élément demandé est introuvable. Il a peut-être été supprimé.",
  405: 'Cette opération n’est pas autorisée.',
  408: 'Le serveur a mis trop de temps à répondre. Réessayez dans quelques instants.',
  409: 'Cette opération entre en conflit avec des données existantes.',
  413: 'Les données envoyées sont trop volumineuses (15 Mo maximum).',
  415: 'Ce format de fichier n’est pas pris en charge.',
  422: 'Certaines informations sont invalides. Vérifiez le formulaire puis réessayez.',
  429: 'Trop de tentatives. Patientez un instant avant de réessayer.',
  500: 'Une erreur est survenue de notre côté. Réessayez dans quelques instants.',
  502: 'Le service est momentanément indisponible. Réessayez dans quelques instants.',
  503: 'Le service est momentanément indisponible. Réessayez dans quelques instants.',
  504: 'Le serveur a mis trop de temps à répondre. Réessayez dans quelques instants.',
};

export function statusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? STATUS_MESSAGES[status >= 500 ? 500 : 400];
}

/** Messages anglais connus (framework, anciens services) → français. */
const KNOWN: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  [/^internal server error$/i, STATUS_MESSAGES[500]],
  [/^(throttlerexception: )?too many requests$/i, STATUS_MESSAGES[429]],
  [/^unauthorized$/i, STATUS_MESSAGES[401]],
  [/^forbidden( resource)?$/i, STATUS_MESSAGES[403]],
  [/^(not found|cannot (get|post|put|patch|delete) .*)$/i, 'Cette adresse n’existe pas.'],
  [/^bad request$/i, STATUS_MESSAGES[400]],
  [/^validation failed.*$/i, STATUS_MESSAGES[400]],
  [/^invalid refresh token$/i, STATUS_MESSAGES[401]],
  [/^(request entity|payload) too large$/i, STATUS_MESSAGES[413]],
  [/^invalid (relation|sort field|sort column|alias for order field).*$/i, 'Critère de recherche ou de tri invalide.'],
  [/^(email|e-mail) already exists$/i, 'Cette adresse e-mail est déjà utilisée.'],
  [/^username already exists$/i, "Ce nom d'utilisateur est déjà utilisé."],
  [/^permission code already exists$/i, 'Ce code de permission existe déjà.'],
  [/^(user|employee|customer|branch|district|division|location city)\b.* not found$/i, (_m, what) => `${FR_ENTITY[what.toLowerCase()] ?? 'Élément'} introuvable.`],
];

const FR_ENTITY: Record<string, string> = {
  user: 'Utilisateur',
  employee: 'Collaborateur',
  customer: 'Client',
  branch: 'Agence',
  district: 'Arrondissement',
  division: 'Département',
  'location city': 'Ville',
};

/** Traductions des messages class-validator par défaut. */
const VALIDATION: Array<[RegExp, (f: string, ...rest: string[]) => string]> = [
  [/^(\S+) should not be empty$/i, (f) => `Le champ « ${f} » est obligatoire.`],
  [/^(\S+) should not be null or undefined$/i, (f) => `Le champ « ${f} » est obligatoire.`],
  [/^(\S+) must be an email$/i, (f) => `Le champ « ${f} » doit contenir une adresse e-mail valide.`],
  [/^(\S+) must be longer than or equal to (\d+) characters$/i, (f, n) => `Le champ « ${f} » doit contenir au moins ${n} caractères.`],
  [/^(\S+) must be shorter than or equal to (\d+) characters$/i, (f, n) => `Le champ « ${f} » ne doit pas dépasser ${n} caractères.`],
  [/^(\S+) must not be less than (\S+)$/i, (f, n) => `Le champ « ${f} » doit être au moins égal à ${n}.`],
  [/^(\S+) must not be greater than (\S+)$/i, (f, n) => `Le champ « ${f} » ne doit pas dépasser ${n}.`],
  [/^(\S+) must be one of the following values: .+$/i, (f) => `La valeur choisie pour « ${f} » n'est pas autorisée.`],
  [/^property (\S+) should not exist$/i, (f) => `Le champ « ${f} » n'est pas accepté.`],
  [/^(\S+) must be (a|an) .+$/i, (f) => `Le champ « ${f} » n'a pas un format valide.`],
  [/^(\S+) must be a valid .+$/i, (f) => `Le champ « ${f} » n'a pas un format valide.`],
];

const ENGLISH = /\b(the|is|are|must|should|cannot|invalid|failed|error|does not|exist|required|already|unable|not found|denied)\b/i;
const FRENCH = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|un|une|des|du|est|pas|vous|votre|veuillez|impossible|aucun|cette|ce|déjà|introuvable|invalide)\b/i;

/** Traduit un message ; `null` s'il reste technique ou en anglais. */
export function toUserMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  if (!text) return null;
  for (const [re, fr] of KNOWN) {
    const m = re.exec(text);
    if (m) return typeof fr === 'string' ? fr : fr(...m);
  }
  for (const [re, build] of VALIDATION) {
    const m = re.exec(text);
    if (m) return build(m[1].replace(/^.*\./, ''), ...m.slice(2));
  }
  if (/\bER_[A-Z_]+\b|sqlstate|duplicate entry|foreign key|queryfailed|<html|typeerror|cannot read propert/i.test(text)) {
    return null;
  }
  return ENGLISH.test(text) && !FRENCH.test(text) ? null : text;
}
