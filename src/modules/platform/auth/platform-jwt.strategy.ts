import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import { getPlatformJwtSecret } from '../common/platform-crypto';
import { PlatformPrincipal } from '../common/platform-principal';

export const PLATFORM_JWT_STRATEGY = 'platform-jwt';

/**
 * Valide les jetons de l'espace plateforme :
 *  - signés avec PLATFORM_JWT_SECRET (un jeton cabinet échoue à la signature) ;
 *  - claim `typ: 'platform'` obligatoire ;
 *  - compte actif et `token_version` inchangée (déconnexion / désactivation
 *    / changement de mot de passe révoquent les jetons émis).
 */
@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  PLATFORM_JWT_STRATEGY,
) {
  constructor(
    @InjectRepository(PlatformAdmin)
    private readonly admins: Repository<PlatformAdmin>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getPlatformJwtSecret(),
    });
  }

  async validate(payload: any): Promise<PlatformPrincipal> {
    if (payload?.typ !== 'platform' || !payload?.sub) {
      throw new UnauthorizedException('Jeton plateforme invalide.');
    }
    const admin = await this.admins.findOne({
      where: { id: Number(payload.sub) },
      select: ['id', 'email', 'full_name', 'role', 'status', 'token_version'],
    });
    if (
      !admin ||
      admin.status !== 'active' ||
      Number(admin.token_version) !== Number(payload.tv ?? -1)
    ) {
      throw new UnauthorizedException('Session plateforme expirée.');
    }
    return {
      isPlatform: true,
      id: admin.id,
      platformAdminId: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
    };
  }
}
