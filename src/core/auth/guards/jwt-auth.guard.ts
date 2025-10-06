// src/auth/jwt-auth.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // console.log('👉 JwtAuthGuard - Authorization header:', req.headers['authorization']);
    return super.canActivate(context);
  }

    handleRequest(err: any, user: any, info: any) {
    // console.log('👉 JwtAuthGuard.handleRequest -> err:', err, 'user:', user, 'info:', info);
    if (err || !user) {
      // log plus d'infos si besoin
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
