import {
  actionsQuery,
  AgentQuery,
  audiencesQuery,
  billableItemsQuery,
  billingFiguresQuery,
  debtorsQuery,
  dossierIdentityQuery,
  dossiersQuery,
  invoicesQuery,
  paymentsQuery,
  readLimit,
  readPeriod,
  readText,
  searchQueries,
} from './agent-queries';

/** Accès réels fournis par AiDatabaseService (droits, connexion, délais). */
export interface AgentToolContext {
  tenantId: number;
  /** L'utilisateur voit les dossiers confidentiels. */
  includeConfidential: boolean;
  /** Exécute une requête métier après contrôle des droits sur ses tables. */
  runQuery(query: AgentQuery): Promise<Array<Record<string, unknown>>>;
  /** Requête générée par le circuit SQL existant (dernier recours). */
  freeQuery(question: string): Promise<{ lignes: Array<Record<string, unknown>>; note?: string }>;
  /** Extraits du guide d'utilisation de l'application. */
  help(question: string): Promise<string>;
  /** Extraits de la base juridique de la plateforme. */
  legal(question: string): Promise<string>;
}

export type AgentToolResult = Record<string, unknown>;

interface AgentTool {
  description: string;
  /** Arguments acceptés, décrits pour le modèle. */
  args: string;
  run(args: Record<string, any>, ctx: AgentToolContext): Promise<AgentToolResult>;
}

const MAX_ROWS = 40;

/**
 * Lignes d'une requête, bornées. `total` est le nombre réel d'éléments
 * correspondants quand la requête le calcule (une liste limitée à 5 lignes
 * peut en compter 40) : c'est lui qu'il faut citer pour « combien ».
 */
async function rows(ctx: AgentToolContext, query: AgentQuery): Promise<AgentToolResult> {
  const lignes = await ctx.runQuery(query);
  const counted = Number(lignes[0]?.total_correspondant);
  const total = Number.isFinite(counted) && lignes.length ? counted : lignes.length;
  return {
    total,
    lignes_affichees: Math.min(lignes.length, MAX_ROWS),
    lignes: lignes.slice(0, MAX_ROWS).map(({ total_correspondant: _total, ...row }) => row),
    ...((lignes.length > MAX_ROWS || total > lignes.length) && { liste_partielle: true }),
  };
}

const scope = (args: Record<string, any>) => ({
  dossier: readText(args.dossier, 60),
  client: readText(args.client, 120),
});

/**
 * Outils de l'agent. Chacun encode une règle métier du cabinet (reste à
 * payer, annulées, supprimées, cabinet courant) dans une requête testée.
 */
export const AGENT_TOOLS: Record<string, AgentTool> = {
  chiffres_facturation: {
    description:
      "Chiffre d'affaires facturé (HT et TTC, factures annulées exclues), montant encaissé et créances à ce jour, sur une période, pour un client ou un dossier.",
    args: '{ periode?: { du?: "AAAA-MM-JJ", au?: "AAAA-MM-JJ" }, client?: nom ou code, dossier?: numéro }',
    run: async (args, ctx) => {
      const [chiffres] = await ctx.runQuery(
        billingFiguresQuery(ctx.tenantId, { ...scope(args), periode: readPeriod(args.periode) }),
      );
      return { periode: readPeriod(args.periode), chiffres: chiffres ?? {} };
    },
  },
  factures: {
    description:
      'Factures avec montant TTC, déjà payé, reste à payer, jours de retard et statut. filtre "non_soldees" = reste à payer > 0 (partiellement payées comprises) ; "en_retard" = non soldées dont l’échéance est dépassée d’au moins retard_min_jours ; "toutes" = toutes (annulées comprises, signalées).',
    args: '{ filtre?: "toutes" | "non_soldees" | "en_retard", retard_min_jours?: nombre, dossier?: numéro, client?: nom ou code, periode?: { du?, au? } (date de facture), limite?: nombre }',
    run: (args, ctx) =>
      rows(
        ctx,
        invoicesQuery(ctx.tenantId, {
          ...scope(args),
          filtre: args.filtre,
          retard_min_jours: Number(args.retard_min_jours) || 0,
          periode: readPeriod(args.periode),
          limite: readLimit(args.limite, 30),
        }),
      ),
  },
  debiteurs: {
    description: 'Clients classés par montant restant dû (le premier est celui qui doit le plus).',
    args: '{ limite?: nombre }',
    run: (args, ctx) => rows(ctx, debtorsQuery(ctx.tenantId, { limite: readLimit(args.limite, 10) })),
  },
  paiements: {
    description: 'Paiements valides reçus (date, montant, facture, dossier, client).',
    args: '{ client?: nom ou code, dossier?: numéro, periode?: { du?, au? } (date de paiement), limite?: nombre }',
    run: (args, ctx) =>
      rows(ctx, paymentsQuery(ctx.tenantId, { ...scope(args), periode: readPeriod(args.periode), limite: readLimit(args.limite, 30) })),
  },
  dossiers: {
    description:
      'Liste ou comptage de dossiers. statut : DRAFT (brouillon), ACTIVE (en cours / actif), CLOSED (clôturé), ARCHIVED (archivé). « total » = nombre réel de dossiers correspondants (même si peu de lignes sont affichées).',
    args: '{ statut?: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED", client?: nom ou code, texte?: mot de l’objet, numéro RG ou partie adverse, limite?: nombre }',
    run: (args, ctx) =>
      rows(
        ctx,
        dossiersQuery(
          ctx.tenantId,
          { statut: readText(args.statut, 20), client: readText(args.client), texte: readText(args.texte), limite: readLimit(args.limite, 30) },
          ctx.includeConfidential,
        ),
      ),
  },
  synthese_dossier: {
    description:
      'Point complet sur un dossier : identité (client, statut, juridiction, partie adverse), factures avec reste à payer, audiences, actions ouvertes et éléments à facturer.',
    args: '{ dossier: numéro du dossier (ou numéro RG) }',
    run: async (args, ctx) => {
      const number = readText(args.dossier, 60);
      if (!number) return { erreur: 'numéro de dossier manquant' };
      const [identite] = await ctx.runQuery(dossierIdentityQuery(ctx.tenantId, number, ctx.includeConfidential));
      if (!identite) return { introuvable: `aucun dossier ${number} dans ce cabinet` };
      const dossier = String(identite.dossier_number);
      const settle = async (query: AgentQuery) => rows(ctx, query).catch((error: Error) => ({ erreur: error.message }));
      const [factures, audiences, actions, aFacturer] = await Promise.all([
        settle(invoicesQuery(ctx.tenantId, { dossier, filtre: 'toutes', limite: 20 })),
        settle(audiencesQuery(ctx.tenantId, { dossier, quand: 'toutes', limite: 10 })),
        settle(actionsQuery(ctx.tenantId, { dossier, etat: 'ouvertes', limite: 15 }, ctx.includeConfidential)),
        settle(billableItemsQuery(ctx.tenantId, { dossier, etat: 'tous', limite: 15 })),
      ]);
      return { identite, factures, audiences, actions_ouvertes: actions, elements_facturables: aFacturer };
    },
  },
  audiences: {
    description: 'Audiences (date, heure, statut, dossier, client, juridiction, renvoi, décision).',
    args: '{ quand?: "a_venir" | "passees" | "toutes", dossier?: numéro, periode?: { du?, au? }, limite?: nombre }',
    run: (args, ctx) =>
      rows(ctx, audiencesQuery(ctx.tenantId, { dossier: readText(args.dossier, 60), quand: args.quand, periode: readPeriod(args.periode), limite: readLimit(args.limite, 20) })),
  },
  actions: {
    description: 'Actions (diligences) des dossiers : titre, statut, échéance, responsable.',
    args: '{ etat?: "ouvertes" | "en_retard" | "terminees" | "toutes", dossier?: numéro, limite?: nombre }',
    run: (args, ctx) =>
      rows(ctx, actionsQuery(ctx.tenantId, { dossier: readText(args.dossier, 60), etat: args.etat, limite: readLimit(args.limite, 30) }, ctx.includeConfidential)),
  },
  elements_a_facturer: {
    description:
      'Éléments facturables : "a_facturer" = prêts à mettre sur facture ; "a_verifier" = tarif ou calcul à contrôler ; "tous". Une action terminée n’est pas forcément facturable.',
    args: '{ etat?: "a_facturer" | "a_verifier" | "tous", dossier?: numéro, limite?: nombre }',
    run: (args, ctx) =>
      rows(ctx, billableItemsQuery(ctx.tenantId, { dossier: readText(args.dossier, 60), etat: args.etat, limite: readLimit(args.limite, 30) })),
  },
  chercher: {
    description: 'Retrouve un dossier, un client ou une facture à partir d’un nom, d’un numéro partiel ou d’un mot.',
    args: '{ texte: ce qu’on cherche }',
    run: async (args, ctx) => {
      const text = readText(args.texte, 80);
      if (!text) return { erreur: 'texte à chercher manquant' };
      const queries = searchQueries(ctx.tenantId, text, ctx.includeConfidential);
      const entries = await Promise.all(
        Object.entries(queries).map(async ([kind, query]) => [kind, await ctx.runQuery(query).catch(() => [])] as const),
      );
      return Object.fromEntries(entries);
    },
  },
  requete_libre: {
    description:
      'Dernier recours, quand aucun autre outil ne convient (paie, dépenses, fournisseurs, comptabilité, documents, clients détaillés…) : décris la donnée voulue en une phrase précise ; une requête est générée et exécutée.',
    args: '{ question: la donnée voulue, avec les filtres }',
    run: async (args, ctx) => {
      const question = readText(args.question, 400);
      if (!question) return { erreur: 'question manquante' };
      const { lignes, note } = await ctx.freeQuery(question);
      return {
        total: lignes.length,
        lignes: lignes.slice(0, MAX_ROWS),
        ...(lignes.length > MAX_ROWS && { liste_partielle: true }),
        ...(note && { note }),
      };
    },
  },
  aide_application: {
    description: 'Guide d’utilisation de l’application (où cliquer, comment faire une opération).',
    args: '{ question: string }',
    run: async (args, ctx) => ({ extraits: await ctx.help(readText(args.question, 300) ?? '') }),
  },
  base_juridique: {
    description: 'Base juridique de la plateforme (textes, délais, procédures en droit camerounais / OHADA).',
    args: '{ question: string }',
    run: async (args, ctx) => ({ extraits: await ctx.legal(readText(args.question, 300) ?? '') }),
  },
};

/** Catalogue des outils pour le prompt. */
export function describeTools(): string {
  return Object.entries(AGENT_TOOLS)
    .map(([name, tool]) => `- ${name} ${tool.args}\n  ${tool.description}`)
    .join('\n');
}

/** Exécute un appel d'outil ; une erreur devient un résultat lisible par le modèle. */
export async function runAgentTool(
  name: string,
  args: Record<string, any>,
  ctx: AgentToolContext,
): Promise<AgentToolResult> {
  const tool = Object.hasOwn(AGENT_TOOLS, name) ? AGENT_TOOLS[name] : undefined;
  if (!tool) return { erreur: `outil inconnu : ${name}` };
  try {
    return await tool.run(args ?? {}, ctx);
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    return { erreur: /refus|droit|autoris|forbidden|permission/i.test(message) ? `accès refusé : ${message}` : 'consultation impossible' };
  }
}
