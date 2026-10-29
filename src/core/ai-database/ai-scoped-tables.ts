import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { WritePlan } from './dto/analysis-response.dto';
import { ScopeCondition } from './tenant-injection';

/**
 * Tables lisibles par l'IA qui ne se filtrent pas (seulement) par tenant_id :
 *  - `cabinets` n'a pas de tenant_id : seule la ligne du cabinet courant ;
 *  - abonnement et échéances : rattachés par cabinet_id ;
 *  - préférences, notifications, e-mails : ceux de l'utilisateur connecté.
 * Fonctions pures, testées dans ai-scoped-tables.spec.ts.
 */
export interface AiScopeContext {
  /** Cabinet courant (null hors requête : aucune ligne). */
  tenantId: number | null;
  /** Utilisateur connecté (null : aucune ligne personnelle). */
  userId: number | null;
  /** Adresse e-mail de l'utilisateur (destinataire des e-mails). */
  email?: string | null;
}

/** Cabinet courant. Une seule ligne, jamais créée ni supprimée par l'IA. */
export const CABINET_TABLE = 'cabinets';

export function buildAiScopedTables(
  context: AiScopeContext,
): Map<string, ScopeCondition[]> {
  // Valeurs impossibles plutôt qu'absence de filtre : sans contexte, rien.
  const tenant =
    context.tenantId && context.tenantId > 0 ? context.tenantId : 0;
  const user = context.userId && context.userId > 0 ? context.userId : 0;
  const email =
    String(context.email ?? '')
      .trim()
      .toLowerCase() || '-';
  return new Map<string, ScopeCondition[]>([
    [CABINET_TABLE, [{ column: 'id', value: tenant }]],
    ['subscriptions', [{ column: 'cabinet_id', value: tenant }]],
    ['subscription_payments', [{ column: 'cabinet_id', value: tenant }]],
    ['user_settings', [{ column: 'user_id', value: user }]],
    ['notifications', [{ column: 'user_id', value: user }]],
    ['mails', [{ column: 'to', value: email, match: 'listContains' }]],
  ]);
}

/**
 * Opérations du plan sur `cabinets` ramenées au cabinet courant : seule la
 * modification est permise, et elle vise toujours la ligne du cabinet (un
 * identifiant d'un autre cabinet est refusé, un critère `match` ignoré).
 * Renvoie un nouveau plan ; les autres opérations sont inchangées.
 */
export function scopeCabinetOperations<T extends Pick<WritePlan, 'operations'>>(
  plan: T,
  tenantId: number | null,
): T {
  const operations = plan?.operations ?? [];
  if (!operations.some((op) => op?.entity === CABINET_TABLE)) return plan;
  if (!tenantId || tenantId <= 0) {
    throw new ForbiddenException(
      'Cabinet courant introuvable : modification impossible.',
    );
  }
  return {
    ...plan,
    operations: operations.map((op) => {
      if (op?.entity !== CABINET_TABLE) return op;
      if (op.operation !== 'UPDATE') {
        throw new BadRequestException(
          "Le cabinet ne peut être que modifié depuis l'assistant (ni création ni suppression).",
        );
      }
      const given = op.entityId;
      if (
        given !== undefined &&
        given !== null &&
        given !== '' &&
        Number(given) !== tenantId
      ) {
        throw new ForbiddenException(
          'Seules les informations de votre cabinet peuvent être modifiées.',
        );
      }
      const { match: _match, all: _all, ...rest } = op;
      return { ...rest, entityId: tenantId };
    }),
  };
}
