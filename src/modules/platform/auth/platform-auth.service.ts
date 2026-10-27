import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import {
  PlatformAdminToken,
  PlatformTokenPurpose,
} from '../entities/platform-admin-token.entity';
import {
  assertStrongPassword,
  frontendBaseUrl,
  generateOtpCode,
  getPlatformJwtExpiresIn,
  getPlatformJwtSecret,
  hmacToken,
  maskEmail,
  randomToken,
  safeEqualHex,
} from '../common/platform-crypto';
import { PlatformMailerService } from '../common/platform-mailer.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformPrincipal } from '../common/platform-principal';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const INVITE_TTL_HOURS = 72;
const RESET_TTL_MINUTES = 60;

interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

const INVALID_CREDENTIALS = 'Identifiants invalides.';

/**
 * Authentification de l'espace plateforme :
 *   1. email + mot de passe → défi OTP envoyé par email (MFA obligatoire)
 *   2. défi + code → jeton plateforme (typ 'platform', PLATFORM_JWT_SECRET)
 * + invitation / réinitialisation de mot de passe par lien à usage unique.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    @InjectRepository(PlatformAdmin)
    private readonly admins: Repository<PlatformAdmin>,
    @InjectRepository(PlatformAdminToken)
    private readonly tokens: Repository<PlatformAdminToken>,
    private readonly jwt: JwtService,
    private readonly mailer: PlatformMailerService,
    private readonly audit: PlatformAuditService,
  ) {}

  // ── Connexion ──────────────────────────────────────────────────────────────

  async login(email: string, password: string, meta: RequestMeta) {
    const normalized = String(email ?? '').trim().toLowerCase();
    const admin = await this.admins
      .createQueryBuilder('a')
      .addSelect('a.password')
      .where('LOWER(a.email) = :email', { email: normalized })
      .getOne();

    const fail = async (reason: string, adminId?: number) => {
      await this.audit.record({
        adminId: adminId ?? null,
        adminEmail: normalized,
        action: 'auth.login_failed',
        summary: reason,
        outcome: 'failure',
        statusCode: 401,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    };

    if (!admin || !admin.password || admin.status !== 'active') {
      // Coût constant : on hache quand même pour ne pas révéler l'existence du compte.
      await bcrypt
        .compare(String(password ?? ''), '$2b$12$' + 'x'.repeat(53))
        .catch(() => false);
      return fail(!admin ? 'Compte inconnu' : 'Compte inactif ou non activé', admin?.id);
    }

    if (admin.locked_until && admin.locked_until.getTime() > Date.now()) {
      await this.audit.record({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'auth.login_locked',
        outcome: 'denied',
        statusCode: 401,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException(
        'Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.',
      );
    }

    const ok = await bcrypt.compare(String(password ?? ''), admin.password);
    if (!ok) {
      const attempts = Number(admin.failed_attempts ?? 0) + 1;
      const locked = attempts >= MAX_FAILED_LOGINS;
      await this.admins.update(admin.id, {
        failed_attempts: locked ? 0 : attempts,
        locked_until: locked
          ? new Date(Date.now() + LOCK_MINUTES * 60_000)
          : admin.locked_until,
      });
      return fail(
        locked ? 'Mot de passe erroné — compte verrouillé' : 'Mot de passe erroné',
        admin.id,
      );
    }

    await this.admins.update(admin.id, { failed_attempts: 0, locked_until: null });

    // Un seul défi OTP actif par admin.
    await this.tokens.update(
      { admin_id: admin.id, purpose: 'login_otp', consumed_at: IsNull() },
      { consumed_at: new Date() },
    );
    const challenge = randomToken(32);
    const code = generateOtpCode();
    await this.tokens.insert({
      admin_id: admin.id,
      purpose: 'login_otp',
      token_hash: hmacToken(challenge),
      code_hash: hmacToken(code),
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      ip: meta.ip,
    });

    await this.mailer.send({
      to: admin.email,
      subject: 'Code de connexion — espace plateforme',
      title: 'Votre code de connexion',
      paragraphs: [
        `Bonjour ${admin.full_name},`,
        `Saisissez ce code pour terminer votre connexion à l'espace plateforme. Il expire dans ${OTP_TTL_MINUTES} minutes.`,
        "Si vous n'êtes pas à l'origine de cette demande, changez immédiatement votre mot de passe.",
      ],
      highlight: code,
      devFallback: `OTP plateforme pour ${admin.email} : ${code}`,
    });

    return {
      otp_required: true,
      challenge,
      expires_in: OTP_TTL_MINUTES * 60,
      email_hint: maskEmail(admin.email),
    };
  }

  async verifyOtp(challenge: string, code: string, meta: RequestMeta) {
    const token = await this.tokens.findOne({
      where: {
        token_hash: hmacToken(challenge),
        purpose: 'login_otp',
        consumed_at: IsNull(),
      },
    });
    if (!token || token.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Code expiré. Reconnectez-vous.');
    }
    if (token.attempts >= OTP_MAX_ATTEMPTS) {
      await this.tokens.update(token.id, { consumed_at: new Date() });
      throw new UnauthorizedException('Trop de tentatives. Reconnectez-vous.');
    }
    if (!safeEqualHex(token.code_hash ?? '', hmacToken(String(code ?? '').trim()))) {
      await this.tokens.update(token.id, { attempts: token.attempts + 1 });
      await this.audit.record({
        adminId: token.admin_id,
        action: 'auth.otp_failed',
        outcome: 'failure',
        statusCode: 401,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Code incorrect.');
    }

    await this.tokens.update(token.id, { consumed_at: new Date() });
    const admin = await this.admins.findOne({ where: { id: token.admin_id } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.admins.update(admin.id, {
      last_login_at: new Date(),
      last_login_ip: meta.ip,
    });
    await this.audit.record({
      adminId: admin.id,
      adminEmail: admin.email,
      action: 'auth.login',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.issueSession(admin);
  }

  private issueSession(admin: PlatformAdmin) {
    const expiresIn = getPlatformJwtExpiresIn();
    const access_token = this.jwt.sign(
      {
        sub: admin.id,
        typ: 'platform',
        role: admin.role,
        tv: Number(admin.token_version ?? 0),
      },
      { secret: getPlatformJwtSecret(), expiresIn: expiresIn as any },
    );
    return { access_token, expires_in: expiresIn, admin: this.toPublic(admin) };
  }

  async logout(principal: PlatformPrincipal) {
    await this.admins.increment({ id: principal.id }, 'token_version', 1);
    return { success: true };
  }

  async me(principal: PlatformPrincipal) {
    const admin = await this.admins.findOne({ where: { id: principal.id } });
    if (!admin) throw new UnauthorizedException();
    return this.toPublic(admin);
  }

  async changePassword(
    principal: PlatformPrincipal,
    current: string,
    next: string,
  ) {
    const admin = await this.admins
      .createQueryBuilder('a')
      .addSelect('a.password')
      .where('a.id = :id', { id: principal.id })
      .getOne();
    if (!admin?.password || !(await bcrypt.compare(String(current ?? ''), admin.password))) {
      throw new BadRequestException('Mot de passe actuel incorrect.');
    }
    await this.applyNewPassword(admin.id, next);
    return { success: true };
  }

  // ── Invitations / réinitialisation ─────────────────────────────────────────

  /** Crée un lien à usage unique et l'envoie par email. */
  async sendAccessLink(
    admin: PlatformAdmin,
    purpose: Extract<PlatformTokenPurpose, 'invite' | 'reset_password'>,
  ): Promise<void> {
    await this.tokens.update(
      { admin_id: admin.id, purpose, consumed_at: IsNull() },
      { consumed_at: new Date() },
    );
    const token = randomToken(32);
    const ttlMs =
      purpose === 'invite'
        ? INVITE_TTL_HOURS * 3_600_000
        : RESET_TTL_MINUTES * 60_000;
    await this.tokens.insert({
      admin_id: admin.id,
      purpose,
      token_hash: hmacToken(token),
      expires_at: new Date(Date.now() + ttlMs),
    });
    const url = `${frontendBaseUrl()}/platform/set-password?token=${encodeURIComponent(token)}`;
    const invite = purpose === 'invite';
    await this.mailer.send({
      to: admin.email,
      subject: invite
        ? "Invitation à l'espace plateforme"
        : 'Réinitialisation de votre mot de passe plateforme',
      title: invite ? 'Vous êtes invité(e)' : 'Réinitialiser votre mot de passe',
      paragraphs: invite
        ? [
            `Bonjour ${admin.full_name},`,
            `Un compte vous a été créé sur l'espace plateforme (rôle : ${admin.role}). Définissez votre mot de passe pour l'activer. Ce lien expire dans ${INVITE_TTL_HOURS} heures.`,
          ]
        : [
            `Bonjour ${admin.full_name},`,
            `Utilisez le lien ci-dessous pour choisir un nouveau mot de passe. Il expire dans ${RESET_TTL_MINUTES} minutes.`,
            "Si vous n'avez rien demandé, ignorez ce message.",
          ],
      action: {
        label: invite ? 'Définir mon mot de passe' : 'Choisir un nouveau mot de passe',
        url,
      },
      devFallback: `Lien plateforme (${purpose}) pour ${admin.email} : ${url}`,
    });
  }

  /** Toujours la même réponse, que le compte existe ou non. */
  async forgotPassword(email: string, meta: RequestMeta) {
    const normalized = String(email ?? '').trim().toLowerCase();
    const admin = await this.admins
      .createQueryBuilder('a')
      .where('LOWER(a.email) = :email', { email: normalized })
      .getOne();
    if (admin && admin.status === 'active') {
      await this.sendAccessLink(admin, 'reset_password');
      await this.audit.record({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'auth.password_reset_requested',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return {
      success: true,
      message: 'Si ce compte existe, un email de réinitialisation a été envoyé.',
    };
  }

  async setPassword(token: string, password: string, meta: RequestMeta) {
    const record = await this.tokens
      .createQueryBuilder('t')
      .where('t.token_hash = :hash', { hash: hmacToken(token) })
      .andWhere('t.purpose IN (:...purposes)', {
        purposes: ['invite', 'reset_password'],
      })
      .andWhere('t.consumed_at IS NULL')
      .getOne();
    if (!record || record.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Lien invalide ou expiré.');
    }
    const admin = await this.admins.findOne({ where: { id: record.admin_id } });
    if (!admin || admin.status !== 'active') {
      throw new BadRequestException('Compte désactivé.');
    }
    await this.applyNewPassword(admin.id, password);
    await this.tokens.update(record.id, { consumed_at: new Date() });
    await this.audit.record({
      adminId: admin.id,
      adminEmail: admin.email,
      action:
        record.purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { success: true };
  }

  private async applyNewPassword(adminId: number, password: string) {
    const error = assertStrongPassword(password);
    if (error) throw new BadRequestException(error);
    const hash = await bcrypt.hash(password, 12);
    await this.admins.update(adminId, {
      password: hash,
      failed_attempts: 0,
      locked_until: null,
    });
    // Révoque les sessions existantes.
    await this.admins.increment({ id: adminId }, 'token_version', 1);
  }

  toPublic(admin: PlatformAdmin) {
    return {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
      status: admin.status,
      last_login_at: admin.last_login_at,
      created_at: admin.created_at,
    };
  }
}
