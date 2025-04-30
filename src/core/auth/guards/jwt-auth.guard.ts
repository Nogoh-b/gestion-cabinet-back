// src/core/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
      /*handleRequest(err: any, user: any, info: any, context: any) {
const request = context.switchToHttp().getRequest();
    console.log('Request Headers:', request.headers); // Vérifiez les headers
    
    if (info) {
      console.error('JWT Validation Error:', info.message);
      switch (info.message) {
        case 'No auth token':
          throw new UnauthorizedException('Token manquant');
        case 'jwt expired':
          throw new UnauthorizedException('Token expiré');
        case 'jwt malformed':
          throw new UnauthorizedException('Token invalide');
      }
    }

    if (err || !user) {
      console.error('Auth Error:', err?.message || 'User not found');
      throw err || new UnauthorizedException('Accès non autorisé');
    }

    return null;
  }*/
}