import { BadRequestException } from '@nestjs/common';
import type { PlatformRole } from '../entities/platform-admin.entity';

export type PlatformAssistantActionType =
  | 'extend'
  | 'grant_free_period'
  | 'grant_unlimited'
  | 'change_plan'
  | 'credit_ai'
  | 'suspend'
  | 'reactivate';

/** Noms résolus côté serveur, pour un résumé fidèle à ce qui sera exécuté. */
interface DescribeContext {
  cabinet: string;
  plan?: string;
}

interface AssistantAction {
  label: string;
  /** Rôles autorisés, identiques à ceux de la route manuelle (owner toujours inclus). */
  roles: PlatformRole[];
  /** Paramètres attendus, pour le prompt. */
  params: string;
  /** Valide et réduit les paramètres renvoyés par le modèle. */
  parse: (raw: Record<string, any>) => Record<string, any>;
  describe: (params: Record<string, any>, ctx: DescribeContext) => string;
}

const note = (raw: Record<string, any>) => {
  const value = typeof raw.note === 'string' ? raw.note.trim().slice(0, 500) : '';
  return value ? { note: value } : {};
};

const intIn = (value: unknown, min: number, max: number, message: string) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new BadRequestException(message);
  }
  return number;
};

const noted = (params: Record<string, any>) => (params.note ? ` Motif : ${params.note}.` : '');

const SUBSCRIPTION_ROLES: PlatformRole[] = ['finance', 'support'];

export const PLATFORM_ASSISTANT_ACTIONS: Record<PlatformAssistantActionType, AssistantAction> = {
  extend: {
    label: 'Prolonger l’abonnement',
    roles: SUBSCRIPTION_ROLES,
    params: 'days (1 à 3660), note',
    parse: (raw) => ({
      days: intIn(raw.days, 1, 3660, 'Nombre de jours invalide (1 à 3660).'),
      ...note(raw),
    }),
    describe: (p, c) => `Prolonger l’abonnement de ${c.cabinet} de ${p.days} jour(s).${noted(p)}`,
  },
  grant_free_period: {
    label: 'Offrir des mois',
    roles: SUBSCRIPTION_ROLES,
    params: 'months (1 à 36), note',
    parse: (raw) => ({
      months: intIn(raw.months, 1, 36, 'Nombre de mois invalide (1 à 36).'),
      ...note(raw),
    }),
    describe: (p, c) => `Offrir ${p.months} mois gratuits à ${c.cabinet}, sans facturation.${noted(p)}`,
  },
  grant_unlimited: {
    label: 'Offrir l’illimité',
    roles: ['finance'],
    params: 'plan_id (plan offert, qui remplace le plan actuel ; si absent, le plan actuel est conservé), note',
    parse: (raw) => ({
      ...(raw.plan_id ? { plan_id: intIn(raw.plan_id, 1, 2147483647, 'Plan invalide.') } : {}),
      ...note(raw),
    }),
    describe: (p, c) =>
      `Offrir à ${c.cabinet} le plan ${c.plan ?? `#${p.plan_id}`} sans date de fin ni facturation. Toute échéance due est annulée.${noted(p)}`,
  },
  change_plan: {
    label: 'Changer de plan',
    roles: SUBSCRIPTION_ROLES,
    params: 'plan_id, cycle (monthly ou yearly, facultatif), mode (keep_period par défaut, ou new_period)',
    parse: (raw) => ({
      plan_id: intIn(raw.plan_id, 1, 2147483647, 'Plan invalide.'),
      ...(['monthly', 'yearly'].includes(raw.cycle) ? { cycle: raw.cycle } : {}),
      mode: raw.mode === 'new_period' ? 'new_period' : 'keep_period',
    }),
    describe: (p, c) =>
      `Passer ${c.cabinet} au plan ${c.plan ?? `#${p.plan_id}`} ${
        p.mode === 'new_period'
          ? 'avec une nouvelle période facturée : le paiement sera exigé pour un plan payant'
          : 'sans facturation, période en cours conservée'
      }.`,
  },
  credit_ai: {
    label: 'Créditer l’IA',
    roles: ['finance'],
    params: 'credits (nombre entier, 1 à 100000000), note',
    parse: (raw) => ({
      credits: intIn(raw.credits, 1, 100_000_000, 'Nombre de crédits invalide.'),
      ...note(raw),
    }),
    describe: (p, c) => `Attribuer ${p.credits} crédits IA à ${c.cabinet}.${noted(p)}`,
  },
  suspend: {
    label: 'Suspendre le cabinet',
    roles: SUBSCRIPTION_ROLES,
    params: 'note (motif obligatoire)',
    parse: (raw) => {
      const params = note(raw);
      if (!params.note || params.note.length < 3) {
        throw new BadRequestException('Le motif de suspension est obligatoire.');
      }
      return params;
    },
    describe: (p, c) =>
      `Suspendre ${c.cabinet} : ses utilisateurs perdent l’accès immédiatement. Motif : ${p.note}.`,
  },
  reactivate: {
    label: 'Réactiver le cabinet',
    roles: SUBSCRIPTION_ROLES,
    params: 'aucun',
    parse: () => ({}),
    describe: (_p, c) =>
      `Lever la suspension manuelle de ${c.cabinet}. Il restera bloqué si son abonnement est échu ou en attente de paiement.`,
  },
};

/** Même règle que PlatformRolesGuard : owner toujours, liste vide = tout admin. */
export function platformRoleAllows(role: PlatformRole, roles: PlatformRole[] = []): boolean {
  return role === 'owner' || !roles.length || roles.includes(role);
}

export function isPlatformAssistantAction(type: unknown): type is PlatformAssistantActionType {
  return typeof type === 'string' && Object.hasOwn(PLATFORM_ASSISTANT_ACTIONS, type);
}
