import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from '../config/jwt.config';
import { UsersService } from 'src/modules/iam/user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private userService: UsersService) {
    super({
        jwtFromRequest: ExtractJwt.fromExtractors([
        (request) => {
          const token = request?.headers?.authorization?.split(' ')[1];
          console.log('Extracted Token:', token); // Debug
          return token;
        },
      ]),
      ignoreExpiration: false,      
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
      throw new Error('Utilisateur non trouvé');
    if (!payload.sub || !payload.username) {
      throw new Error('Payload JWT invalide');
    }
    
    const user = await this.userService.findById(payload.sub);
    
    if (!user) {
      throw new Error('Utilisateur non trouvé');
    }
    
    return user;
  }
}