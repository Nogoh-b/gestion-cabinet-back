// src/auth/jwt-auth.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from 'src/core/decorators/public.decorator';

/**
 * JwtAuthGuard — vérifie le token JWT.
 * Respecte le décorateur @Public() : si la route (méthode OU classe) est marquée
 * publique, le guard laisse passer sans token.
 *
 * Cela évite le conflit entre :
 *   - @UseGuards(JwtAuthGuard) au niveau classe (besoin d'auth par défaut)
 *   - @Public() sur une méthode spécifique (override public)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Vérifie @Public() sur la méthode puis sur la classe
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
