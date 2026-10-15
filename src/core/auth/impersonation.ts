import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Informations de session support attachées à req.user. */
export interface ImpersonationInfo {
  sessionId: number;
  adminId: number;
  adminEmail: string;
  expiresAt: string;
}

/**
 * Actions interdites pendant une session « en tant que » : identifiants,
 * double authentification, rôles/permissions et paiements restent du ressort
 * exclusif du cabinet.
 */
const RESTRICTED: Array<{ methods: string[]; pattern: RegExp }> = [
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], pattern: /^\/auth\/(?!impersonation\/end)/i },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], pattern: /^\/(role-permissions?|user-roles?|permissions?)(\/|$)/i },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], pattern: /\/password(\/|$)/i },
  { methods: ['POST', 'PATCH'], pattern: /^\/subscriptions\/(pay|change|renew|coupons|payments)(\/|$)/i },
  { methods: ['POST', 'PUT', 'PATCH', 'DELETE'], pattern: /^\/admin\/backup(\/|$)/i },
];

export function assertImpersonationAllowed(method: string, url: string): void {
  const path = String(url ?? '').split('?')[0].replace(/^\/t\/[a-z0-9]+(?=\/)/i, '');
  const m = String(method ?? '').toUpperCase();
  if (RESTRICTED.some((r) => r.methods.includes(m) && r.pattern.test(path))) {
    throw new ForbiddenException(
      'Action non autorisée pendant une session support (connexion « en tant que »).',
    );
  }
}

/** Vérifie la session support d'un jeton (active, non expirée, même cabinet/utilisateur). */
export async function loadImpersonation(
  db: DataSource,
  sessionId: number,
  userId: number,
  tenantId: number,
): Promise<ImpersonationInfo> {
  const rows: Array<any> = await db.query(
    `SELECT id, admin_id, admin_email, cabinet_id, user_id, expires_at, ended_at
       FROM platform_impersonation_sessions WHERE id = ? LIMIT 1`,
    [sessionId],
  );
  const s = rows[0];
  if (
    !s ||
    s.ended_at ||
    new Date(s.expires_at).getTime() <= Date.now() ||
    Number(s.user_id) !== Number(userId) ||
    Number(s.cabinet_id) !== Number(tenantId)
  ) {
    throw new UnauthorizedException('Session support terminée.');
  }
  return {
    sessionId: Number(s.id),
    adminId: Number(s.admin_id),
    adminEmail: s.admin_email,
    expiresAt: new Date(s.expires_at).toISOString(),
  };
}
