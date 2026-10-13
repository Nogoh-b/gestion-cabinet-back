import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IS_PLATFORM_KEY } from './platform.decorator';

@Injectable()
export class PublicGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
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

    return super.canActivate(context);
  }
}
