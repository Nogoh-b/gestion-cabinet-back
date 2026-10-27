import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_PLATFORM_KEY } from './platform.decorator';
import { assertClientRouteAllowed } from '../auth/client-access';

@Injectable()
export class PublicGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // Routes plateforme : authentifiées par PlatformAuthGuard (jeton distinct).
    const isPlatform = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPlatform) return true;

    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    // Comptes du portail client : refus par défaut, hors routes @AllowClient().
    assertClientRouteAllowed(this.reflector, context);
    return true;
  }
}
