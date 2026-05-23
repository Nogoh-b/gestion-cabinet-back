// src/modules/auth/auth.service.ts
import * as bcrypt from 'bcrypt';
import { EmployeeResponseDto } from 'src/modules/agencies/employee/dto/response-employee.dto';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { UsersService } from 'src/modules/iam/user/user.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

import {
  ForbiddenException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private employeeService: EmployeeService,
    private jwtService: JwtService,
    private mailService: MailService,
    private authTokenService: AuthTokenService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    // ── 1. Recherche de l'utilisateur (User est global, pas tenant-scoped) ──
    let user: any;
    try {
      user = await this.usersService.findByEmail(username);
    } catch {
      // findByEmail lance NotFoundException si introuvable
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // ── 2. Vérification du mot de passe ────────────────────────────────────
    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // ── 3. Vérification tenant ─────────────────────────────────────────────
    //
    // User n'est pas une entité tenant-scoped (pas de tenant_id).
    // La vérification d'appartenance au cabinet se fait via Employee,
    // qui EST tenant-scoped (TenantRepositoryPatch ajoute WHERE tenant_id = ?).
    //
    // Le TenantResolverMiddleware appelle maintenant next() DANS
    // tenantContext.run(), donc getCurrentTenantId() retourne ici le
    // bon cabinet dès l'étape guard — avant même que l'interceptor tourne.
    const currentTenantId = getCurrentTenantId();

    // Ne pas bloquer si aucun tenant résolu (routes système, tests, etc.)
    if (currentTenantId && currentTenantId !== 1) {
      let employee: any = null;
      try {
        employee = await this.employeeService.findByEmail(username);
      } catch {
        employee = null;
      }

      if (!employee) {
        // Message générique — ne pas révéler si le compte existe dans un autre cabinet
        this.logger.warn(
          `[Auth] Tentative cross-tenant: email="${username}" ` +
          `n'est pas un employé du cabinet tenant_id=${currentTenantId}`,
        );
        throw new UnauthorizedException('Identifiants invalides');
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { password, ...result } = user;
    return result;
  }

  /**
   * Retourne le profil de l'utilisateur avec les permissions FRAÎCHES issues de la DB.
   * Appelé par GET /auth/profile pour éviter que le JWT (snapshot login) serve de source de vérité.
   */
  async getFreshProfile(userId: number) {
    const permissionObjects = await this.usersService.getUserPermissions(userId);
    const permissions = permissionObjects.map((p: any) => p.code);
    console.log(`[getFreshProfile] userId=${userId} → ${permissions.length} permissions`);
    return { permissions };
  }

  async login(data: any) {
    const user: EmployeeResponseDto | null = await this.employeeService.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur inexistant');
    }
    const role: string | null = (await this.usersService.findOne(data.id))?.role;
    const permissionObjects = await this.usersService.getUserPermissions(data.id);
    const permissions = permissionObjects.map((p: any) => p.code);

    const payload: JwtPayload = {
      sub:        user.id,
      username:   user.email,
      role,
      permissions,
      customerId: (data as any).customer?.id ?? null,
      tenantId:   (data as any).tenant_id   ?? 1,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
      permissions,
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
    const permissionObjects = await this.usersService.getUserPermissions(user.id);
    const permissions = permissionObjects.map((p: any) => p.code);

    const payload: JwtPayload = {
      sub:      employee?.id || user.id,
      username: user.email,
      role,
      permissions,
      tenantId: (employee as any)?.tenant_id ?? (user as any)?.tenant_id ?? 1,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
      data: {
        access_token: accessToken,
        user: employee || user,
        permissions,
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
    const permissionObjects = await this.usersService.getUserPermissions(user.id);
    const permissions = permissionObjects.map((p: any) => p.code);

    const payload: JwtPayload = {
      sub:      employee?.id || user.id,
      username: user.email,
      role,
      permissions,
      tenantId: (employee as any)?.tenant_id ?? (user as any)?.tenant_id ?? 1,
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
        permissions,
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