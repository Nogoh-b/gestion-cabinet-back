// src/modules/auth/auth.service.ts
import * as bcrypt from 'bcrypt';
import { TenantContext, getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { UsersService } from 'src/modules/iam/user/user.service';

import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { EmployeeStatus } from 'src/modules/agencies/employee/entities/employee.entity';
import { MailService } from '../shared/emails/emails.service';
import { MailTemplateService } from '../../modules/mail-template/mail-template.service';
import { AuthTokenService } from './auth-token.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private employeeService: EmployeeService,
    private jwtService: JwtService,
    private mailService: MailService,
    private authTokenService: AuthTokenService,
    private tenantContext: TenantContext,
    private mailTemplateService: MailTemplateService,
  ) {}

  /**
   * Rejette un employé désactivé (Inactif=0) ou suspendu (-1).
   * Vérification effectuée aux moments clés : connexion et rafraîchissement de
   * token (un employé désactivé en cours de session perd l'accès au refresh).
   */
  private assertEmployeeActive(employee: any): void {
    const status: number | undefined =
      employee?.status ?? employee?.employee?.status;
    if (
      status === EmployeeStatus.INACTIVE ||
      status === EmployeeStatus.SUSPENDED
    ) {
      throw new ForbiddenException(
        'Compte collaborateur inactif ou suspendu. Contactez votre administrateur.',
      );
    }
  }

  /**
   * Valide les identifiants ET vérifie l'appartenance au cabinet.
   *
   * @param username  Email de l'utilisateur
   * @param pass      Mot de passe en clair
   * @param tenantId  ID du cabinet cible — transmis par LocalStrategy via req['resolvedTenantId'].
   *                  Indépendant d'AsyncLocalStorage (qui ne se propage pas toujours à travers
   *                  l'infrastructure Passport/NestJS au niveau des guards).
   */
  async validateUser(username: string, pass: string, tenantId = 1): Promise<any> {
    this.logger.debug(`[validateUser] email="${username}" tenantId=${tenantId}`);

    // ── 1. Recherche de l'utilisateur (User est global, sans tenant_id) ────
    let user: any;
    try {
      user = await this.usersService.findByEmail(username);
    } catch {
      throw new UnauthorizedException('Identifiants invalides EMAIL');
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('Identifiants invalides EMAIL ou mot de passe');
    }

    // ── 2. Vérification du mot de passe ────────────────────────────────────
    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants invalides MOT DE PASSE');
    }

    // ── 3. Vérification d'appartenance au cabinet ───────────────────────────
    // User n'a pas de tenant_id → on vérifie + récupère le tenant via Employee.
    let resolvedTenantId = tenantId;

    if (tenantId && tenantId !== 1) {
      let employee: any = null;
      await this.tenantContext.run(tenantId, async () => {
        try {
          employee = await this.employeeService.findByEmail(username, false);
        } catch {
          employee = null;
        }
      });

      if (!employee) {
        this.logger.warn(
          `[Auth] Tentative cross-tenant bloquée: email="${username}" ` +
          `absent du cabinet tenant_id=${tenantId}`,
        );
        throw new UnauthorizedException('Identifiants invalides Aucun employé trouvé pour ce cabinet');
      }

      // tenant_id de l'employee (source de vérité pour le JWT)
      resolvedTenantId = (employee as any).tenant_id ?? tenantId;
    }

    const { password, ...result } = user;
    // Attacher le tenantId résolu pour que login() puisse l'injecter dans le JWT
    (result as any)._resolvedTenantId = resolvedTenantId;
    return result;
  }

  /**
   * Retourne les permissions FRAÎCHES depuis la DB.
   * Appelé par GET /auth/profile pour éviter que le JWT (snapshot login) serve de source de vérité.
   *
   * @param userId    ID de l'utilisateur (fallback si roleCode absent)
   * @param roleCode  Code de rôle issu du JWT — évite un SELECT user inutile quand disponible
   */
  async getFreshProfile(userId: number, roleCode?: string) {
    const permissionObjects = roleCode
      ? await this.usersService.getPermissionsByRoleCode(roleCode)
      : await this.usersService.getUserPermissions(userId);
      const user = await this.usersService.findOne(userId);
    const permissions = (permissionObjects ?? []).map((p: any) => p.code);
    console.log(`[getFreshProfile] userId=${userId} role=${roleCode} → ${permissions.length} permissions`);
    return { ...user, permissions };
  }

  async login(data: any) {
    // Double authentification : si activée, on n'émet pas le token tout de
    // suite — on envoie un OTP par e-mail et on renvoie un « challenge ».
    if (data?.mfa_enabled) {
      await this.sendMfaOtp(data.email, data.first_name || data.username);
      return {
        mfa_required: true,
        email: data.email,
        message: 'Code de vérification envoyé par e-mail.',
      };
    }
    return this.issueSession(data);
  }

  /** Envoie l'OTP de connexion (réutilise l'infrastructure OTP existante). */
  private async sendMfaOtp(email: string, name?: string): Promise<void> {
    const { otp } = await this.authTokenService.createOTP(email, 'mfa');
    try {
      const rendered = await this.mailTemplateService.renderOrCreateSystemDefault('otp_code', {
        firstName: name || 'Utilisateur',
        otpCode: otp,
        expiryMinutes: 10,
      });
      await this.mailService.sendDirect({
        to: email,
        subject: rendered.subject || 'Code de connexion',
        html: rendered.html,
      });
    } catch {
      await this.mailService.sendDirect({
        to: email,
        subject: 'Code de connexion',
        html: `<p>Votre code de connexion : <b>${otp}</b> (valable 10 minutes).</p>`,
      });
    }
  }

  /** Vérifie l'OTP de connexion et émet le token (2e étape du MFA). */
  async verifyMfa(email: string, otp: string) {
    const { isValid } = await this.authTokenService.verifyOTP(email, otp, 'mfa');
    if (!isValid) {
      throw new UnauthorizedException('Code invalide ou expiré');
    }
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    (user as any)._resolvedTenantId =
      (user as any).tenant_id ?? this.tenantContext.getTenantId();
    return this.issueSession(user);
  }

  /** Active/désactive le MFA pour un utilisateur. */
  async setMfa(userId: number, enabled: boolean): Promise<{ mfa_enabled: boolean }> {
    await this.usersService.update(userId, { mfa_enabled: enabled } as any);
    return { mfa_enabled: enabled };
  }

  /** Émet la session (token + user + permissions). */
  private async issueSession(data: any) {
    // data EST l'entité User issue de validateUser() — data.role est déjà là.
    // On évite les doublons : findOne(userId) x2 + findByEmail(employee) x2.
    const role: string | null = data.role ?? null;

    // Paralléliser : employee (pour payload JWT) + permissions (role → codes)
    const [user, permissionObjects] = await Promise.all([
      this.employeeService.findByEmail(data.email),
      this.usersService.getPermissionsByRoleCode(role),
    ]);

    if (!user) {
      throw new UnauthorizedException('Utilisateur inexistant');
    }
    // Refuser la connexion d'un collaborateur désactivé/suspendu.
    this.assertEmployeeActive(user);
    const permissions = (permissionObjects ?? []).map((p: any) => p.code);

    // Priorité pour le tenantId du JWT :
    //  1. _resolvedTenantId posé par validateUser() (source la plus fiable — vient du guard)
    //  2. getCurrentTenantId()  (contexte AsyncLocalStorage posé par TenantInterceptor)
    //  3. tenant_id de l'employee (entity TypeORM si disponible)
    //  4. Fallback 1
    const tenantId: number =
      (data as any)._resolvedTenantId
      ?? getCurrentTenantId()
      ?? (user as any).tenant_id
      ?? 1;

    this.logger.log(`[login] email="${data.email}" → JWT tenantId=${tenantId}`);

    const payload: JwtPayload = {
      sub:        user.id,
      username:   user.email,
      role:       role ?? undefined,
      permissions,
      customerId: (data as any).customer?.id ?? null,
      tenantId,
    };

    // Écraser user.role (position de l'Employee = "avocat") avec le rôle RBAC réel
    // (User.role = "admin"|"secretaire"|…) pour que le frontend n'affiche pas
    // le mauvais mode pendant les quelques secondes avant le retour de /auth/profile. 
    const userWithRole = role ? { ...user, role } : user;

    return {
      access_token: this.jwtService.sign(payload),
      user: userWithRole,
      permissions,
    };
  }

  /**
   * Mot de passe oublié - Envoyer OTP
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ success: boolean; message: string }> {
    const { email } = forgotPasswordDto;
    const tenantId = this.tenantContext.getTenantId();

    // Vérifier si l'utilisateur existe
    const user = await this.usersService.findByEmailForPasswordReset(email, tenantId);
    if (!user) {
      // Pour des raisons de sécurité, on ne révèle pas si l'email existe ou non
      return { 
        success: true, 
        message: 'Si un compte existe avec cet email, vous recevrez un code de réinitialisation.' 
      };
    }

    // Créer un OTP
    const { otp, expiresAt } = await this.authTokenService.createOTP(email, 'reset_password');

    // Envoyer l'email avec l'OTP — template DB `otp_code` en priorité,
    // repli sur le template fichier si le template DB n'est pas disponible.
    const otpUserName = user.first_name || user.username || 'Utilisateur';
    try {
      const rendered = await this.mailTemplateService.renderOrCreateSystemDefault('otp_code', {
        firstName: otpUserName,
        otpCode: otp,
        expiryMinutes: 10,
      });
      await this.mailService.sendDirect({
        to: email,
        subject: rendered.subject || 'Code de réinitialisation de mot de passe',
        html: rendered.html,
      });
    } catch {
      await this.mailService.sendDirect({
        to: email,
        subject: 'Code de réinitialisation de mot de passe',
        templateName: 'auth/otp-reset-password',
        context: { otp, expiresIn: 10, userName: otpUserName },
      });
    }

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
    const user = await this.usersService.findByEmailForPasswordReset(email, this.tenantContext.getTenantId());
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    const userTenantId = (user as any).tenant_id ?? this.tenantContext.getTenantId();

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Mettre à jour le mot de passe
    await this.tenantContext.run(userTenantId, async () => {
      await this.usersService.update(user.id, {password:hashedPassword});
    });

    // Marquer le token comme utilisé
    await this.authTokenService.markTokenAsUsed(token);

    // Confirmation de changement de mot de passe (ne bloque jamais le flux).
    // Template DB `password_changed` en priorité, repli sur un HTML inline.
    try {
      const pcFirstName = user.first_name || user.username || '';
      const pcChangedAt = new Date().toLocaleString('fr-FR');
      let pcSubject = 'Votre mot de passe a été modifié';
      let pcHtml =
        `<h2 style="margin-top:0;">Mot de passe modifié</h2>` +
        `<p>Bonjour ${pcFirstName},</p>` +
        `<p>Nous vous confirmons que votre mot de passe a bien été modifié le ${pcChangedAt}.</p>` +
        `<p style="color:#dc2626;font-size:13px;">Si vous n'êtes pas à l'origine de cette opération, contactez immédiatement votre administrateur.</p>`;
      try {
        const rendered = await this.mailTemplateService.renderOrCreateSystemDefault('password_changed', {
          firstName: pcFirstName,
          changedAt: pcChangedAt,
        });
        if (rendered?.html) {
          pcSubject = rendered.subject || pcSubject;
          pcHtml = rendered.html;
        }
      } catch {
        // template DB indisponible → repli inline
      }
      await this.mailService.sendDirect({ to: email, subject: pcSubject, html: pcHtml });
    } catch (mailErr) {
      this.logger.warn(`[resetPassword] Email de confirmation non envoyé : ${(mailErr as Error)?.message}`);
    }

    // Optionnel: Générer un nouveau token JWT pour connecter l'utilisateur automatiquement
    let employee: any = null;
    await this.tenantContext.run(userTenantId, async () => {
      employee = await this.employeeService.findByEmail(email);
    });
    const role = user.role;
    const permissionObjects = await this.tenantContext.run(userTenantId, () => this.usersService.getUserPermissions(user.id));
    const permissions = permissionObjects.map((p: any) => p.code);

    const payload: JwtPayload = {
      sub:      employee?.id || user.id,
      username: user.email,
      role,
      permissions,
      tenantId: (employee as any)?.tenant_id ?? userTenantId,
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
    const user = await this.usersService.findByEmailForPasswordReset(email, this.tenantContext.getTenantId());
    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }
    const userTenantId = (user as any).tenant_id ?? this.tenantContext.getTenantId();

    // Vérifier si l'utilisateur a déjà un mot de passe
    if (user.password) {
      throw new ConflictException('Un mot de passe a déjà été défini pour ce compte');
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Mettre à jour le mot de passe
    await this.tenantContext.run(userTenantId, async () => {
      await this.usersService.update(user.id, {password:hashedPassword});
    });

    // Marquer le token comme utilisé
    await this.authTokenService.markTokenAsUsed(token);

    // Générer un token JWT pour connecter l'utilisateur automatiquement
    let employee: any = null;
    await this.tenantContext.run(userTenantId, async () => {
      employee = await this.employeeService.findByEmail(email);
    });
    const role = user.role;
    const permissionObjects = await this.tenantContext.run(userTenantId, () => this.usersService.getUserPermissions(user.id));
    const permissions = permissionObjects.map((p: any) => p.code);

    const payload: JwtPayload = {
      sub:      employee?.id || user.id,
      username: user.email,
      role,
      permissions,
      tenantId: (employee as any)?.tenant_id ?? userTenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    // Email de bienvenue — template DB `account_opening` en priorité, repli fichier.
    const spFirstName = user.first_name || user.username || 'Utilisateur';
    try {
      const rendered = await this.mailTemplateService.renderOrCreateSystemDefault('account_opening', {
        firstName: spFirstName,
        loginUrl: process.env.APP_FRONTEND_URL ? `${process.env.APP_FRONTEND_URL}/login` : '',
      });
      await this.mailService.sendDirect({ to: email, subject: rendered.subject, html: rendered.html });
    } catch {
      await this.mailService.sendDirect({
        to: email,
        subject: 'Bienvenue sur LexiGuard',
        templateName: 'entities/auth/welcome-set-password',
        context: { userName: spFirstName },
      });
    }

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

    // Refuser le rafraîchissement si le collaborateur a été désactivé/suspendu
    // depuis l'émission du token (User.employee est chargé en eager).
    this.assertEmployeeActive(user);

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
