// src/modules/auth/auth.service.ts
import * as bcrypt from 'bcrypt';
import { EmployeeResponseDto } from 'src/modules/agencies/employee/dto/response-employee.dto';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { UsersService } from 'src/modules/iam/user/user.service';

import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthTokenService } from './auth-token.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { MailService } from '../shared/emails/emails.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private employeeService: EmployeeService,
    private jwtService: JwtService,
    private mailService: MailService,
    private authTokenService: AuthTokenService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(username);
    
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
    const user: EmployeeResponseDto | null = await this.employeeService.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur inexistant');
    }
    const role: string | null = (await this.usersService.findOne(data.id))?.role;

    const payload: JwtPayload = { 
      sub: user.id,
      username: user.email,
      role: role
    };
    
    return {
      access_token: this.jwtService.sign(payload),
      user
    };
  }

  /**
   * Mot de passe oublié - Envoyer OTP
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ success: boolean; message: string }> {
    const { email } = forgotPasswordDto;

    // Vérifier si l'utilisateur existe
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Pour des raisons de sécurité, on ne révèle pas si l'email existe ou non
      return { 
        success: true, 
        message: 'Si un compte existe avec cet email, vous recevrez un code de réinitialisation.' 
      };
    }

    // Créer un OTP
    const { otp, expiresAt } = await this.authTokenService.createOTP(email, 'reset_password');

    // Envoyer l'email avec l'OTP
    await this.mailService.sendDirect({
      to: email,
      subject: 'Code de réinitialisation de mot de passe',
      templateName: 'auth/otp-reset-password',
      context: {
        otp,
        expiresIn: 10,
        userName: user.first_name || user.username || 'Utilisateur',
      }
    });

    return {
      success: true,
      message: 'Un code de vérification a été envoyé à votre adresse email.',
    };
  }

  /**
   * Vérifier l'OTP
   */
  async verifyOTP(verifyOtpDto: VerifyOtpDto): Promise<{ success: boolean; token?: string; message: string }> {
    const { email, otp, type } = verifyOtpDto;

    // Vérifier l'OTP
    const { isValid, token } = await this.authTokenService.verifyOTP(email, otp, type);

    if (!isValid) {
      throw new BadRequestException('Code invalide ou expiré');
    }

    return {
      success: true,
      token,
      message: 'Code vérifié avec succès',
    };
  }

  /**
   * Réinitialiser le mot de passe (après vérification OTP)
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ success: boolean; message: string; data?: any }> {
    const { token, password, confirmPassword } = resetPasswordDto;

    // Vérifier que les mots de passe correspondent
    if (password !== confirmPassword) {
      throw new BadRequestException('Les mots de passe ne correspondent pas');
    }

    // Vérifier le token
    const { isValid, email } = await this.authTokenService.verifyResetToken(token, 'reset_password');

    if (!isValid || !email) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    // Récupérer l'utilisateur
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Mettre à jour le mot de passe
    await this.usersService.update(user.id, {password:hashedPassword});

    // Marquer le token comme utilisé
    await this.authTokenService.markTokenAsUsed(token);

    // Optionnel: Générer un nouveau token JWT pour connecter l'utilisateur automatiquement
    const employee = await this.employeeService.findByEmail(email);
    const role = user.role;
    
    const payload: JwtPayload = {
      sub: employee?.id || user.id,
      username: user.email,
      role: role,
    };
    
    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        access_token: accessToken,
        user: employee || user,
      },
    };
  }

  /**
   * Créer un mot de passe (invitation)
   */
  async setPassword(setPasswordDto: SetPasswordDto): Promise<{ success: boolean; message: string; data?: any }> {
    const { token, password, confirmPassword } = setPasswordDto;

    // Vérifier que les mots de passe correspondent
    if (password !== confirmPassword) {
      throw new BadRequestException('Les mots de passe ne correspondent pas');
    }

    // Vérifier le token
    const { isValid, email } = await this.authTokenService.verifyResetToken(token, 'set_password');

    if (!isValid || !email) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    // Récupérer l'utilisateur
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    // Vérifier si l'utilisateur a déjà un mot de passe
    if (user.password) {
      throw new ConflictException('Un mot de passe a déjà été défini pour ce compte');
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Mettre à jour le mot de passe
    await this.usersService.update(user.id, {password:hashedPassword});

    // Marquer le token comme utilisé
    await this.authTokenService.markTokenAsUsed(token);

    // Générer un token JWT pour connecter l'utilisateur automatiquement
    const employee = await this.employeeService.findByEmail(email);
    const role = user.role;
    
    const payload: JwtPayload = {
      sub: employee?.id || user.id,
      username: user.email,
      role: role,
    };
    
    const accessToken = this.jwtService.sign(payload);

    // Envoyer un email de confirmation
    await this.mailService.sendDirect({
      to: email,
      subject: 'Bienvenue sur LexiGuard',
      templateName: 'entities/auth/welcome-set-password',
      context: {
        userName: user.first_name || user.username || 'Utilisateur',
      }
    });

    return {
      success: true,
      message: 'Mot de passe créé avec succès',
      data: {
        access_token: accessToken,
        user: employee || user,
      },
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