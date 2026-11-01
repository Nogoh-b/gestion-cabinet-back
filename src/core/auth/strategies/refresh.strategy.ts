import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import {
  readCookie,
  REFRESH_COOKIE,
} from '../session-cookie.util';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh') {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET est obligatoire');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => readCookie(request, REFRESH_COOKIE),
      ]),
      secretOrKey: secret,
      passReqToCallback: true,
      ignoreExpiration: false,
    });
  }

  validate(req: Request, payload: any) {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    const resolvedTenantId = (req as any).resolvedTenantId as
      | number
      | undefined;

    if (!refreshToken || !payload?.sub || !payload?.tenantId) {
      throw new UnauthorizedException('Jeton de renouvellement invalide');
    }
    if (
      resolvedTenantId !== undefined &&
      Number(payload.tenantId) !== resolvedTenantId
    ) {
      throw new UnauthorizedException(
        'Le jeton ne correspond pas au cabinet demandé',
      );
    }

    return { ...payload, refreshToken };
  }
}
