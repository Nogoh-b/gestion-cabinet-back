import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
      // passReqToCallback: true → validate() reçoit la requête en 1er argument,
      // ce qui permet de croiser jwt.tenantId avec req['resolvedTenantId'].
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const jwtTenantId: number      = payload.tenantId ?? 1;
    const resolvedTenantId: number = (req as any)['resolvedTenantId'] ?? 1;

    // ── Validation cross-tenant ──────────────────────────────────────────────
    // Si l'URL pointe vers le cabinet B mais le JWT appartient au cabinet A,
    // on rejette la requête pour bloquer les accès inter-cabinets.
    // On n'applique pas si l'un des deux est le tenant par défaut (1)
    // pour rester compatible avec les scripts/tests sans tenant.
    if (
      jwtTenantId !== 1 &&
      resolvedTenantId !== 1 &&
      jwtTenantId !== resolvedTenantId
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
