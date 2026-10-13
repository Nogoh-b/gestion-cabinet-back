import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { getJwtSecret } from 'src/core/config/secrets';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { UsersService } from 'src/modules/iam/user/user.service';
import { EmployeeStatus } from 'src/modules/agencies/employee/entities/employee.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContext,
  ) {
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
    // Un jeton de l'espace plateforme n'est jamais accepté sur une route
    // cabinet (signé avec un autre secret, mais on refuse explicitement).
    if (payload?.typ === 'platform') {
      throw new UnauthorizedException('Jeton plateforme non valide ici.');
    }
    const jwtTenantId: number = payload.tenantId ?? 1;
    const resolvedTenantId: number | undefined = (req as any)[
      'resolvedTenantId'
    ];
    const sessionUser = await this.usersService.findSessionState(
      Number(payload.sub),
      jwtTenantId,
    );
    const employeeStatus = sessionUser?.employee?.status;
    if (
      !sessionUser ||
      sessionUser.status !== 1 ||
      employeeStatus === EmployeeStatus.INACTIVE ||
      employeeStatus === EmployeeStatus.SUSPENDED
    ) {
      throw new UnauthorizedException(
        'Ce compte a été bloqué par un administrateur.',
      );
    }

    // ── Permissions FRAÎCHES ─────────────────────────────────────────────────
    // Le JWT est signé pour 30 jours (core.module) et figerait les permissions
    // du login : une permission accordée ou retirée au rôle n'aurait aucun effet
    // côté API avant reconnexion (403 « Forbidden resource » sur des écrans que
    // l'UI affiche déjà). On relit donc les permissions du rôle en base, dans le
    // contexte du cabinet du jeton, à chaque requête authentifiée.
    // `sessionUser.role` (base) prime sur `payload.role` pour la même raison.
    const role = sessionUser.role ?? payload.role ?? null;
    const freshPermissions = await this.tenantContext.run(jwtTenantId, () =>
      this.usersService.getPermissionsByRoleCode(role),
    );
    const permissions: string[] = (freshPermissions ?? []).map(
      (permission: any) => permission.code,
    );

    // ── Validation cross-tenant (fail-closed) ────────────────────────────────
    // Un jeton d'un cabinet A ne doit JAMAIS accéder aux données d'un cabinet
    // B. Aucune exception : l'accès inter-cabinets relève exclusivement de
    // l'espace plateforme (`/platform`, comptes et jetons distincts) ; la
    // permission SUPER_ADMIN d'un cabinet ne donne plus ce pouvoir.
    //  - resolvedTenantId undefined (pas de header/subdomain/path) → on fait
    //    confiance au tenant du JWT (appels internes, scripts, clients API).
    //  - Tenant résolu explicitement et différent du JWT → rejet.
    if (resolvedTenantId !== undefined && resolvedTenantId !== jwtTenantId) {
      throw new UnauthorizedException(
        "Accès refusé : vos identifiants n'appartiennent pas à ce cabinet.",
      );
    }

    return {
      id: payload.sub,
      userId: payload.sub,
      username: payload.username,
      email: payload.email,
      role,
      permissions,
      customerId: payload.customerId ?? null,
      tenantId: jwtTenantId,
    };
  }
}
