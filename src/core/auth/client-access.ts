import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_CLIENT_KEY } from '../decorators/allow-client.decorator';
import { UserRole } from '../enums/user-role.enum';

/** Compte du portail client (rôle relu en base par JwtStrategy). */
export function isClientUser(user: any): boolean {
  return user?.role === UserRole.CLIENT;
}

/**
 * Liste blanche du portail client : un compte `client` n'atteint que les
 * routes marquées @AllowClient() (méthode ou contrôleur). Tout le reste est
 * refusé, y compris les routes qui ne contrôlent aucune permission. Les rôles
 * du cabinet ne sont pas concernés.
 */
export function assertClientRouteAllowed(
  reflector: Reflector,
  context: ExecutionContext,
): void {
  const user = context.switchToHttp().getRequest()?.user;
  if (!isClientUser(user)) return;

  const allowed = reflector.getAllAndOverride<boolean>(ALLOW_CLIENT_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!allowed) {
    throw new ForbiddenException(
      "Cette ressource n'est pas accessible depuis l'espace client.",
    );
  }
}

/**
 * Projection explicite : `true` copie la valeur telle quelle (scalaire ou
 * date), un objet restreint à son tour la relation (ou chaque élément d'une
 * liste). Tout champ absent de la description n'est jamais renvoyé.
 */
export interface ClientViewSpec {
  [field: string]: true | ClientViewSpec;
}

/**
 * LISTE BLANCHE de ce qu'un client reçoit d'un dossier (GET /dossiers et
 * GET /dossiers/:id). Elle reprend ce que lisent les pages de l'espace client
 * et rien de plus : un nouveau champ du dossier reste donc invisible du client
 * tant qu'on ne l'ajoute pas ici.
 *
 * Volontairement exclus (usage interne du cabinet) : analyse et recommandation,
 * probabilité de succès, budget et frais, issue et montants obtenus, accord
 * transactionnel, partie adverse (avocat, contact), tiers, diligences,
 * collaborateurs, conversation interne, étapes de procédure, notes et
 * décisions d'audience. Les documents et factures passent par
 * `/client-portal` (dépôts du client, pièces « client » validées, factures
 * émises) : la liste brute énumérerait aussi les documents internes.
 */
export const CLIENT_DOSSIER_VIEW: ClientViewSpec = {
  id: true,
  dossier_number: true,
  object: true,
  description: true,
  status: true,
  // Pastille d'urgence de la liste « Mes dossiers ».
  danger_level: true,
  opening_date: true,
  closing_date: true,
  court_name: true,
  case_number: true,
  procedure_type: { id: true, name: true },
  jurisdiction: { id: true, name: true },
  lawyer: { full_name: true },
  audiences: {
    id: true,
    audience_date: true,
    audience_time: true,
    type: true,
    status: true,
    room: true,
  },
};

function project(source: unknown, spec: ClientViewSpec): unknown {
  if (Array.isArray(source)) return source.map((item) => project(item, spec));
  // null, texte, nombre : rien à restreindre (ex. juridiction réduite à son nom).
  if (source === null || typeof source !== 'object') return source;

  const view: Record<string, unknown> = {};
  for (const [field, rule] of Object.entries(spec)) {
    // Lecture par accesseur : fonctionne aussi pour les getters des entités
    // (ex. `lawyer.full_name`), qu'une copie des propriétés propres perdrait.
    const value = (source as Record<string, unknown>)[field];
    if (value === undefined) continue;
    view[field] = rule === true ? value : project(value, rule);
  }
  return view;
}

/**
 * Dossier tel que le voit un compte client : uniquement les champs de
 * CLIENT_DOSSIER_VIEW. Ne modifie pas l'original. À appliquer à chaque
 * dossier renvoyé à un client, liste comme fiche.
 */
export function toClientDossierView(dossier: unknown): any {
  if (!dossier || typeof dossier !== 'object') return dossier;
  return project(dossier, CLIENT_DOSSIER_VIEW);
}
