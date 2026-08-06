import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ACCESS_COOKIE, readCookie } from '../session-cookie.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET est obligatoire');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => readCookie(request, ACCESS_COOKIE),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      // passReqToCallback: true → validate() reçoit la requête en 1er argument,
      // ce qui permet de croiser jwt.tenantId avec req['resolvedTenantId'].
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const jwtTenantId = Number(payload.tenantId);
    const resolvedTenantId = (req as any)['resolvedTenantId'] as number | undefined;
    const permissions: string[]    = payload.permissions ?? [];
    const isSuperAdmin             = permissions.includes('SUPER_ADMIN');

    if (!Number.isInteger(jwtTenantId) || jwtTenantId <= 0) {
      throw new UnauthorizedException('Jeton sans cabinet valide');
    }

    // ── Validation cross-tenant ──────────────────────────────────────────────
    // Le cross-tenant (URL pointant vers le cabinet B alors que le JWT
    // appartient au cabinet A) n'est autorisé qu'aux porteurs de la permission
    // SUPER_ADMIN. Pour tout autre utilisateur, dès qu'une requête cible un
    // cabinet RÉSOLU (resolvedTenantId !== 1) différent de celui du JWT, on
    // refuse — y compris un JWT tenant=1 qui tenterait d'atteindre un cabinet.
    // Quand aucun cabinet n'est résolu (pas de x-tenant-code), on reste
    // permissif et on fait confiance au tenant du JWT (scripts/appels internes).
    if (
      !isSuperAdmin &&
      resolvedTenantId !== undefined &&
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
      tenantId:    isSuperAdmin && resolvedTenantId ? resolvedTenantId : jwtTenantId,
    };
  }
}
