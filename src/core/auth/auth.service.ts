import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsersService } from 'src/modules/iam/user/user.service';
import { User } from 'src/modules/iam/user/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

    async validateUser(username: string, pass: string): Promise<any> {
      const user = await this.usersService.findByUsername(username);
      
      if (!user || !user.password) {
          throw new UnauthorizedException('Utilisateur inexistant');
      }

      const isPasswordValid = await bcrypt.compare(pass, user.password);
      
      if (!isPasswordValid) {
          throw new UnauthorizedException('Mot de passe incorrect');
      }

      const { password, ...result } = user;
      return result;
    }

  async login(data: any) {
    const user : User | null  = await this.usersService.findByUsername(data.username);
    if (!user) {
        throw new UnauthorizedException('Utilisateur inexistant');
    }
    const role : string |  null = (await this.usersService.findOne(data.id))?.role

    const payload: JwtPayload = { 
      sub: user.id,
      username: user.username,
      role : role
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role : role
      }
    };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !user.refreshToken) throw new ForbiddenException();
    
    const tokensMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!tokensMatch) throw new ForbiddenException('Invalid refresh token');

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  private async generateTokens(user: any) {
    const payload: JwtPayload = { 
      sub: user.id,
      username: user.username,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    await this.usersService.updateRefreshToken(
      user.id,
      await bcrypt.hash(refreshToken, 10)
    );

    return { accessToken, refreshToken };
  }

  async getUserProfile(userId: number) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const { password, ...result } = user;
    return result;
  }
}