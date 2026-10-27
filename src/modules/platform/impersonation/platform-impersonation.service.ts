import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getJwtSecret } from 'src/core/config/secrets';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';
import { frontendBaseUrl } from '../common/platform-crypto';

const SESSION_MINUTES = 60;

/**
 * Connexion « en tant que » : un admin plateforme (Propriétaire / Support)
 * ouvre une session limitée dans un cabinet, au nom d'un utilisateur, pour
 * le support. Jeton cabinet court, lié à une session révocable.
 */
@Injectable()
export class PlatformImpersonationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async start(
    cabinetId: number,
    input: { userId?: number; reason: string },
    admin: PlatformPrincipal,
    ip: string | null,
  ) {
    const [cabinet] = await this.db.query('SELECT id, name, code FROM cabinets WHERE id = ?', [cabinetId]);
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');
    const userQuery = input.userId
      ? this.db.query(
          `SELECT id, email, username, role, status, first_name, last_name FROM \`user\`
            WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
          [input.userId, cabinetId],
        )
      : this.db.query(
          `SELECT id, email, username, role, status, first_name, last_name FROM \`user\`
            WHERE tenant_id = ? AND role = 'admin' AND status = 1 AND deleted_at IS NULL
            ORDER BY id ASC LIMIT 1`,
          [cabinetId],
        );
    const [user] = await userQuery;
    if (!user) throw new BadRequestException('Aucun utilisateur actif à utiliser dans ce cabinet.');
    if (Number(user.status) !== 1) {
      throw new BadRequestException('Cet utilisateur est bloqué : débloquez-le ou choisissez-en un autre.');
    }
    if (user.role === 'client') {
      throw new BadRequestException("La connexion « en tant que » vise les membres du cabinet, pas les clients.");
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + SESSION_MINUTES * 60_000);
    const result: any = await this.db.query(
      `INSERT INTO platform_impersonation_sessions
         (admin_id, admin_email, cabinet_id, user_id, user_email, reason, started_at, expires_at, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [admin.id, admin.email, cabinetId, user.id, user.email, input.reason.slice(0, 500), startedAt, expiresAt, ip],
    );
    const sessionId = Number(result?.insertId);

    const token = this.jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        tenantId: cabinetId,
        imp: sessionId,
        imp_by: admin.email,
      },
      { secret: getJwtSecret(), expiresIn: `${SESSION_MINUTES}m` },
    );

    PlatformAuditContext.set({
      action: 'impersonation.start',
      targetType: 'cabinet_user',
      targetId: user.id,
      cabinetId,
      summary: `Connexion en tant que ${user.email} (${cabinet.name}) — ${input.reason}`,
      after: { session_id: sessionId, user_id: user.id, expires_at: expiresAt },
    });

    const url = `${frontendBaseUrl()}/t/${cabinet.code}/auth/impersonate#token=${encodeURIComponent(token)}`;
    return {
      session_id: sessionId,
      token,
      url,
      expires_at: expiresAt,
      cabinet: { id: cabinet.id, name: cabinet.name, code: cabinet.code },
      user: {
        id: user.id,
        email: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username,
        role: user.role,
      },
    };
  }

  async list(filters: { cabinetId?: number; active?: boolean }) {
    const where: string[] = [];
    const params: any[] = [];
    if (filters.cabinetId) {
      where.push('s.cabinet_id = ?');
      params.push(filters.cabinetId);
    }
    if (filters.active) where.push('s.ended_at IS NULL AND s.expires_at > NOW()');
    return this.db.query(
      `SELECT s.*, c.name AS cabinet_name,
              (s.ended_at IS NULL AND s.expires_at > NOW()) AS is_active
         FROM platform_impersonation_sessions s
         JOIN cabinets c ON c.id = s.cabinet_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY s.started_at DESC LIMIT 200`,
      params,
    ).then((rows: any[]) => rows.map((r) => ({ ...r, is_active: !!Number(r.is_active) })));
  }

  async revoke(sessionId: number, admin: PlatformPrincipal) {
    const [s] = await this.db.query('SELECT * FROM platform_impersonation_sessions WHERE id = ?', [sessionId]);
    if (!s) throw new NotFoundException('Session introuvable');
    if (!s.ended_at) {
      await this.db.query(
        "UPDATE platform_impersonation_sessions SET ended_at = NOW(), ended_by = 'admin' WHERE id = ?",
        [sessionId],
      );
    }
    PlatformAuditContext.set({
      action: 'impersonation.revoke',
      targetType: 'impersonation',
      targetId: sessionId,
      cabinetId: s.cabinet_id,
      summary: `Session support #${sessionId} (${s.user_email}) révoquée par ${admin.email}`,
    });
    return { success: true };
  }

  /** Fin de session à l'initiative de l'admin, depuis l'onglet du cabinet. */
  async endFromTenant(sessionId: number) {
    await this.db.query(
      "UPDATE platform_impersonation_sessions SET ended_at = NOW(), ended_by = 'user' WHERE id = ? AND ended_at IS NULL",
      [sessionId],
    );
    return { success: true };
  }
}
