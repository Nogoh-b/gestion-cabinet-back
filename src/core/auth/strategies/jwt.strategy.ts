import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { getJwtSecret } from 'src/core/config/secrets';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      // passReqToCallback: true → validate() reçoit la requête en 1er argument,
      // ce qui permet de croiser jwt.tenantId avec req['resolvedTenantId'].
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const jwtTenantId: number      = payload.tenantId ?? 1;
    const resolvedTenantId: number | undefined = (req as any)['resolvedTenantId'];
    const permissions: string[]    = payload.permissions ?? [];
    const isSuperAdmin             = permissions.includes('SUPER_ADMIN');

    // ── Validation cross-tenant (fail-closed) ────────────────────────────────
    // PRINCIPE : sur une route authentifiée, un jeton d'un cabinet A ne doit
    // JAMAIS pouvoir accéder aux données d'un cabinet B. L'ancienne logique
    // contournait la vérification quand resolvedTenantId === 1 (valeur par
    // défaut), ce qui permettait à un attaquant d'omettre le header
    // x-tenant-code pour échapper au contrôle cross-tenant.
    //
    // Nouveau comportement :
    //  - resolvedTenantId est désormais undefined quand AUCUN tenant n'est
    //    explicitement résolu (pas de header/subdomain/path). Dans ce cas, on
    //    fait confiance au tenant du JWT (appels internes, scripts, clients
    //    API qui ne gèrent pas la résolution de cabinet).
    //  - Si un tenant EST résolu explicitement et diffère du JWT → rejet,
    //    sauf SUPER_ADMIN.
    //  - Le cabinet système (tenant_id=1) sans SUPER_ADMIN ne peut pas
    //    accéder aux données métier d'un cabinet résolu.
    if (
      !isSuperAdmin &&
      resolvedTenantId !== undefined &&
      resolvedTenantId !== jwtTenantId
    ) {
      throw new UnauthorizedException(
        'Accès refusé : vos identifiants n\'appartiennent pas à ce cabinet.',
      );
    }

    return {
      id:          payload.sub,
      userId:      payload.sub,
      username:    payload.username,
      email:       payload.email,
      role:        payload.role,
      permissions: payload.permissions ?? [],
      customerId:  payload.customerId  ?? null,
      tenantId:    jwtTenantId,
    };
  }
}
