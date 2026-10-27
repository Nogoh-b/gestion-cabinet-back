// src/modules/ai-skills/legal-deadlines.ts

/**
 * Délais de procédure calculés de façon déterministe : le modèle choisit la
 * règle et la date de départ, le calcul est fait ici.
 *
 * Règles OHADA : Acte uniforme portant organisation des procédures
 * simplifiées de recouvrement et des voies d'exécution (AUPSRVE) et
 * Règlement de procédure de la CCJA. Délais francs selon l'art. 335 AUPSRVE.
 * Règles nationales (Cameroun) : marquées « à vérifier » — à confirmer selon
 * la matière et la juridiction avant toute diligence.
 */

export interface DeadlineRule {
  code: string;
  label: string;
  /** Événement qui fait courir le délai. */
  startEvent: string;
  /** Le délai court de la signification (sinon de la date de la décision ou de l'acte). */
  fromService: boolean;
  amount: number;
  unit: 'jours' | 'mois';
  /** Délai franc : ni le jour de départ ni le jour d'échéance ne comptent. */
  franc: boolean;
  source: string;
  /** Règle de texte uniforme (OHADA) ; false = règle nationale à vérifier. */
  verified: boolean;
  /** Titre de la diligence à créer. */
  diligence: string;
}

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    code: 'ip_signification',
    label: "Signification de l'ordonnance d'injonction de payer",
    startEvent: "date de l'ordonnance d'injonction de payer",
    fromService: false,
    amount: 3,
    unit: 'mois',
    franc: true,
    source: 'AUPSRVE, art. 7 (à défaut, l’ordonnance est non avenue)',
    verified: true,
    diligence: "Faire signifier l'ordonnance d'injonction de payer",
  },
  {
    code: 'ip_opposition',
    label: "Opposition à une injonction de payer",
    startEvent: "signification de l'ordonnance d'injonction de payer",
    fromService: true,
    amount: 15,
    unit: 'jours',
    franc: true,
    source: 'AUPSRVE, art. 10',
    verified: true,
    diligence: "Former opposition à l'injonction de payer",
  },
  {
    code: 'ip_formule_executoire',
    label: 'Demande de formule exécutoire (injonction de payer)',
    startEvent: "expiration du délai d'opposition",
    fromService: false,
    amount: 2,
    unit: 'mois',
    franc: true,
    source: 'AUPSRVE, art. 17 (à défaut, l’ordonnance est non avenue)',
    verified: true,
    diligence: "Demander l'apposition de la formule exécutoire",
  },
  {
    code: 'ip_appel',
    label: "Appel de la décision rendue sur opposition",
    startEvent: 'date de la décision sur opposition',
    fromService: false,
    amount: 30,
    unit: 'jours',
    franc: true,
    source: 'AUPSRVE, art. 15',
    verified: true,
    diligence: "Interjeter appel de la décision sur opposition",
  },
  {
    code: 'saisie_vente_commandement',
    label: 'Délai du commandement de payer avant saisie-vente',
    startEvent: 'signification du commandement de payer',
    fromService: true,
    amount: 8,
    unit: 'jours',
    franc: true,
    source: 'AUPSRVE, art. 92 (la saisie-vente est possible à son expiration)',
    verified: true,
    diligence: 'Procéder à la saisie-vente (commandement expiré)',
  },
  {
    code: 'saisie_conservatoire_titre',
    label: 'Obtention d’un titre exécutoire après saisie conservatoire',
    startEvent: 'saisie conservatoire',
    fromService: false,
    amount: 1,
    unit: 'mois',
    franc: true,
    source: 'AUPSRVE, art. 61 (à défaut, la saisie est caduque)',
    verified: true,
    diligence: 'Introduire l’action en vue d’un titre exécutoire (saisie conservatoire)',
  },
  {
    code: 'saisie_attribution_denonciation',
    label: 'Dénonciation de la saisie-attribution au débiteur',
    startEvent: 'saisie-attribution',
    fromService: false,
    amount: 8,
    unit: 'jours',
    franc: true,
    source: 'AUPSRVE, art. 160 (à peine de caducité)',
    verified: true,
    diligence: 'Dénoncer la saisie-attribution au débiteur',
  },
  {
    code: 'saisie_attribution_contestation',
    label: 'Contestation d’une saisie-attribution',
    startEvent: 'dénonciation de la saisie au débiteur',
    fromService: true,
    amount: 1,
    unit: 'mois',
    franc: true,
    source: 'AUPSRVE, art. 170',
    verified: true,
    diligence: 'Contester la saisie-attribution',
  },
  {
    code: 'ccja_pourvoi',
    label: 'Pourvoi en cassation devant la CCJA',
    startEvent: 'signification de la décision attaquée',
    fromService: true,
    amount: 2,
    unit: 'mois',
    franc: false,
    source: 'Règlement de procédure de la CCJA, art. 28',
    verified: true,
    diligence: 'Former pourvoi devant la CCJA',
  },
  {
    code: 'appel_civil',
    label: 'Appel en matière civile ou commerciale',
    startEvent: 'signification du jugement',
    fromService: true,
    amount: 3,
    unit: 'mois',
    franc: false,
    source: 'Droit camerounais de la procédure civile — à vérifier',
    verified: false,
    diligence: 'Interjeter appel',
  },
  {
    code: 'appel_social',
    label: 'Appel en matière sociale',
    startEvent: 'prononcé du jugement',
    fromService: false,
    amount: 15,
    unit: 'jours',
    franc: false,
    source: 'Code du travail camerounais — à vérifier',
    verified: false,
    diligence: 'Interjeter appel (matière sociale)',
  },
  {
    code: 'appel_penal',
    label: 'Appel en matière pénale',
    startEvent: 'prononcé du jugement',
    fromService: false,
    amount: 10,
    unit: 'jours',
    franc: false,
    source: 'Code de procédure pénale camerounais — à vérifier',
    verified: false,
    diligence: 'Interjeter appel (matière pénale)',
  },
  {
    code: 'pourvoi_cour_supreme',
    label: 'Pourvoi devant la Cour suprême',
    startEvent: "signification de l'arrêt",
    fromService: true,
    amount: 30,
    unit: 'jours',
    franc: false,
    source: 'Loi sur la Cour suprême du Cameroun — à vérifier',
    verified: false,
    diligence: 'Former pourvoi devant la Cour suprême',
  },
];

export function deadlineRule(code: unknown): DeadlineRule | undefined {
  return DEADLINE_RULES.find((rule) => rule.code === String(code ?? '').trim());
}

/** Liste des règles pour le prompt du modèle. */
export function deadlineRulesPrompt(): string {
  return DEADLINE_RULES.map((rule) =>
    `- ${rule.code} : ${rule.label} — ${rule.amount} ${rule.unit} à compter de la ${rule.startEvent} (${rule.source})`,
  ).join('\n');
}

/** « 2026-10-19 » → date locale (minuit) ; null si illisible. */
export function parseIsoDate(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(match[2]) - 1 ? null : date;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function frDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Même quantième n mois plus tard (fin de mois si le jour n'existe pas). */
export function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
}

export interface ComputedDeadline {
  /** Dernier jour pour agir. */
  deadline: Date;
  detail: string;
}

/**
 * Dernier jour utile. Délai franc : le jour de départ et le jour d'échéance ne
 * comptent pas (l'acte peut encore être fait le lendemain du terme). Aucun
 * report pour jour férié n'est appliqué : la date affichée est la plus prudente.
 */
export function computeDeadline(start: Date, rule: Pick<DeadlineRule, 'amount' | 'unit' | 'franc'>): ComputedDeadline {
  const term = rule.unit === 'mois' ? addMonths(start, rule.amount) : addDays(start, rule.amount);
  const deadline = rule.franc ? addDays(term, 1) : term;
  const detail = rule.franc
    ? `délai franc de ${rule.amount} ${rule.unit} : ni le jour de départ ni le jour du terme ne sont comptés`
    : `${rule.amount} ${rule.unit} à compter du lendemain du point de départ`;
  return { deadline, detail };
}

/** Jours restants (négatif si expiré). */
export function daysLeft(deadline: Date, today = new Date()): number {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((deadline.getTime() - base.getTime()) / 86_400_000);
}
