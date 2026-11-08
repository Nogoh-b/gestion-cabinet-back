import { DataSource } from 'typeorm';
import { matchHelpDocs } from 'src/core/ai-database/help-knowledge';
import type { PlatformRole } from '../entities/platform-admin.entity';
import type { PlatformCabinetsService } from '../cabinets/platform-cabinets.service';
import type { PlatformPaymentsService } from '../payments/platform-payments.service';
import type { PlatformRevenueService } from '../revenue/platform-revenue.service';
import type { PlatformAiUsageService } from '../ai/platform-ai-usage.service';

export const PLATFORM_HELP_DIR = 'platform';

export interface PlatformAssistantDeps {
  db: DataSource;
  cabinets: PlatformCabinetsService;
  payments: PlatformPaymentsService;
  revenue: PlatformRevenueService;
  usage: PlatformAiUsageService;
}

export interface PlatformAssistantTool {
  description: string;
  /** Arguments acceptés, pour le prompt. */
  args: string;
  /** Rôles de la page d'origine (owner toujours inclus). Vide = tous. */
  roles?: PlatformRole[];
  /** Question qui appelle ces données : l'outil est lancé sans attendre le modèle. */
  auto?: RegExp;
  run: (args: Record<string, any>, deps: PlatformAssistantDeps) => Promise<unknown>;
}

const text = (value: unknown, max = 100) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const positive = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};
const day = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const oneOf = (value: unknown, allowed: string[]) =>
  typeof value === 'string' && allowed.includes(value) ? value : undefined;

const SUBSCRIPTION_STATUSES = ['trial', 'active', 'pending_payment', 'suspended', 'expired', 'none'];

/** Colonnes utiles au modèle : ni coordonnées ni références de paiement. */
function paymentRow(p: any) {
  return {
    cabinet_id: p.cabinet_id,
    cabinet: p.cabinet_name,
    montant: p.amount,
    devise: p.currency,
    echeance: p.due_date,
    declare_le: p.declared_at,
    plan: p.plan_name,
    periode_fin: p.period_end,
  };
}

function cabinetRow(c: any) {
  return {
    id: c.id,
    nom: c.name,
    code: c.code,
    statut: c.status,
    motif_suspension: c.suspension_reason,
    plan_id: c.plan_id,
    plan: c.plan_name,
    abonnement: c.subscription_status,
    cycle: c.billing_cycle,
    essai: c.is_trial,
    fin_essai: c.trial_ends_at,
    fin_periode: c.ends_at,
    montant: c.amount,
    utilisateurs: c.users_count,
    echeances_dues: c.pending_payments,
  };
}

const payments = async (status: string, args: Record<string, any>, deps: PlatformAssistantDeps) => {
  const { data, meta } = await deps.payments.list({
    status,
    cabinet_id: positive(args.cabinet_id),
    limit: 50,
  } as any);
  return { total: meta.total, montant_total: meta.amount_total, lignes: data.map(paymentRow) };
};

/** Liste blanche des lectures : aucun SQL ni paramètre libre ne vient du modèle. */
export const PLATFORM_ASSISTANT_TOOLS: Record<string, PlatformAssistantTool> = {
  impayes: {
    description: 'Échéances dues (impayés) : cabinet, montant, échéance.',
    args: 'cabinet_id (facultatif)',
    auto: /impay|echeances? dues?|n'?(ont|a) pas (encore )?(paye|regle)|retards? de paiement/,
    run: (args, deps) => payments('due', args, deps),
  },
  paiements_a_valider: {
    description: 'Paiements déclarés par les cabinets, en attente de validation.',
    args: 'cabinet_id (facultatif)',
    auto: /paiements? (declares?|a valider)/,
    run: (args, deps) => payments('awaiting_validation', args, deps),
  },
  cabinets: {
    description: 'Recherche de cabinets, avec leur abonnement courant.',
    args: 'search (nom, code ou email), status (active, trial, suspended)',
    run: async (args, deps) => {
      const { data, meta } = await deps.cabinets.list({
        search: text(args.search),
        status: oneOf(args.status, ['active', 'trial', 'suspended']),
        limit: 20,
      } as any);
      return { total: meta.total, lignes: data.map(cabinetRow) };
    },
  },
  abonnements: {
    description: 'Abonnements par statut ou proches de leur échéance.',
    args: `subscription_status (${SUBSCRIPTION_STATUSES.join(', ')}), expiring_within_days, plan_id`,
    run: async (args, deps) => {
      const { data, meta } = await deps.cabinets.listSubscriptions({
        subscription_status: oneOf(args.subscription_status, SUBSCRIPTION_STATUSES),
        expiring_within_days: positive(args.expiring_within_days),
        plan_id: positive(args.plan_id),
        sort_by: 'ends_at',
        sort_direction: 'ASC',
        limit: 30,
      } as any);
      return { total: meta.total, lignes: data.map(cabinetRow) };
    },
  },
  cabinet: {
    description: 'Fiche d’un cabinet : abonnement, compteurs, revenus.',
    args: 'cabinet_id (obligatoire)',
    run: async (args, deps) => {
      const id = positive(args.cabinet_id);
      if (!id) return { erreur: 'cabinet_id manquant' };
      const c = await deps.cabinets.detail(id);
      const s = c.subscription;
      return {
        id: c.id,
        nom: c.name,
        statut: c.status,
        motif_suspension: c.suspension_reason,
        illimite_offert: c.unlimited_granted,
        abonnement: s && {
          statut: s.status,
          plan_id: s.plan_id,
          cycle: s.billing_cycle,
          fin_periode: s.ends_at,
          fin_essai: s.trial_ends_at,
          montant: Number(s.amount),
        },
        compteurs: c.counts,
        revenus: c.revenue,
        derniere_activite: c.last_activity_at,
      };
    },
  },
  plans: {
    description: 'Plans existants (identifiant, nom, tarifs). À lire avant de proposer un plan.',
    args: 'aucun',
    run: (_args, deps) =>
      deps.db.query(
        'SELECT id, code, name, price_monthly, price_yearly, is_active FROM plans ORDER BY id',
      ),
  },
  revenus: {
    description: 'Synthèse financière d’une période (mois en cours par défaut) : encaissé, MRR, impayés, churn.',
    args: 'from, to (AAAA-MM-JJ)',
    roles: ['finance'],
    auto: /\b(revenus?|chiffre d'?affaires|mrr|arr|churn|encaisse)\b/,
    run: (args, deps) => deps.revenue.overview(day(args.from), day(args.to)),
  },
  consommation_ia: {
    description: 'Consommation IA d’une période : totaux, principaux cabinets et modèles.',
    args: 'from, to (AAAA-MM-JJ)',
    auto: /consommation ia|cout (de l')?ia|credits? ia consommes?|tokens/,
    run: async (args, deps) => {
      const usage = await deps.usage.overview(day(args.from), day(args.to));
      return {
        periode: usage.period,
        devise: usage.currency,
        totaux: usage.totals,
        cabinets: usage.cabinets.slice(0, 10),
        modeles: usage.models.slice(0, 10),
      };
    },
  },
  documentation: {
    description: 'Fiche de documentation de la console sur un sujet.',
    args: 'topic (mots du sujet)',
    run: async (args) =>
      matchHelpDocs(text(args.topic, 200) ?? '', { dir: PLATFORM_HELP_DIR }).map(({ doc }) => ({
        titre: doc.title,
        contenu: doc.content,
      })),
  },
};
