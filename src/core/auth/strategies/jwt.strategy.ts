import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private jwtService: JwtService, private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
    });
  }
  /*canActivate(context: ExecutionContext): boolean {
    console.log('ok')
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers['authorization'];
    if (!authHeader) return false;

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) return false;

    try {
      const payload = this.jwtService.verify(token);
      req['user'] = payload; // stocke le payload pour le controller
      return true;
    } catch {
      return false;
    }
  }*/

  async validate(payload: any) {
    // console.log('✅ JwtStrategy.validate payload:', payload);
    return await this.authService.getUserProfile(payload.sub) //{ userId: payload.sub, username: payload.username };
  }
}