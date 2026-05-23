// src/auth/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
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
    const tenantId: number = (req as any)['resolvedTenantId'] ?? 1;
    const user = await this.authService.validateUser(username, password, tenantId);
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return user;
  }
}
