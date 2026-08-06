// src/auth/local.strategy.ts
import { Request } from 'express';
import { Strategy } from 'passport-local';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { AuthService } from '../auth.service';


@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    // passReqToCallback: true → validate() reçoit la requête en 1er argument.
    // Cela permet de passer req['resolvedTenantId'] (posé par le middleware)
    // à validateUser(), sans dépendre d'AsyncLocalStorage qui peut ne pas
    // se propager à travers l'infrastructure NestJS/Passport.
    super({ passReqToCallback: true });
  }

  async validate(req: Request, username: string, password: string): Promise<any> {
    // resolvedTenantId est posé par TenantResolverMiddleware avant les guards
    const tenantId = (req as any)['resolvedTenantId'] as number | undefined;
    if (!tenantId) {
      throw new UnauthorizedException('Le code cabinet est obligatoire');
    }
    const user = await this.authService.validateUser(username, password, tenantId);
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides (email, mot de passe ou cabinet)');
    }
    return user;
  }
}
