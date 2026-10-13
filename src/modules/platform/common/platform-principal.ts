import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformRole } from '../entities/platform-admin.entity';

/** Admin plateforme authentifié (req.user sur les routes `/platform`). */
export interface PlatformPrincipal {
  isPlatform: true;
  id: number;
  platformAdminId: number;
  email: string;
  full_name: string;
  role: PlatformRole;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformPrincipal =>
    ctx.switchToHttp().getRequest().user,
);

export function requestIp(req: any): string | null {
  return (req?.ip ?? req?.socket?.remoteAddress ?? null)?.slice?.(0, 64) ?? null;
}
