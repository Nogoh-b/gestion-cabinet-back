import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformAdmin } from '../entities/platform-admin.entity';
import { PlatformAuthService } from '../auth/platform-auth.service';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';
import {
  InvitePlatformAdminDto,
  UpdatePlatformAdminDto,
} from './dto/platform-admin.dto';

/** Gestion des comptes plateforme (réservée au Propriétaire). */
@Injectable()
export class PlatformAdminsService {
  constructor(
    @InjectRepository(PlatformAdmin)
    private readonly admins: Repository<PlatformAdmin>,
    private readonly auth: PlatformAuthService,
  ) {}

  async list() {
    const rows = await this.admins.find({ order: { created_at: 'ASC' } });
    const pending = await this.admins
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.password IS NULL')
      .getRawMany<{ id: number }>();
    const pendingIds = new Set(pending.map((p) => Number(p.id)));
    return rows.map((admin) => ({
      ...this.auth.toPublic(admin),
      invitation_pending: pendingIds.has(admin.id),
    }));
  }

  async invite(dto: InvitePlatformAdminDto, actor: PlatformPrincipal) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.admins
      .createQueryBuilder('a')
      .where('LOWER(a.email) = :email', { email })
      .getOne();
    if (exists) throw new ConflictException('Un compte existe déjà pour cet email.');

    const admin = await this.admins.save(
      this.admins.create({
        email,
        full_name: dto.full_name.trim(),
        role: dto.role,
        status: 'active',
        password: null,
        created_by_admin_id: actor.id,
      }),
    );
    await this.auth.sendAccessLink(admin, 'invite');
    PlatformAuditContext.set({
      action: 'admin.invite',
      targetType: 'platform_admin',
      targetId: admin.id,
      summary: `Invitation de ${email} (${dto.role})`,
      after: { email, full_name: admin.full_name, role: admin.role },
    });
    return this.auth.toPublic(admin);
  }

  async update(id: number, dto: UpdatePlatformAdminDto, actor: PlatformPrincipal) {
    const admin = await this.admins.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('Compte plateforme introuvable.');
    const before = this.auth.toPublic(admin);

    if (id === actor.id && (dto.role && dto.role !== admin.role)) {
      throw new BadRequestException('Vous ne pouvez pas modifier votre propre rôle.');
    }
    if (id === actor.id && dto.status === 'disabled') {
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    }
    const losesOwner =
      admin.role === 'owner' &&
      admin.status === 'active' &&
      ((dto.role && dto.role !== 'owner') || dto.status === 'disabled');
    if (losesOwner) {
      const owners = await this.admins.count({
        where: { role: 'owner', status: 'active' },
      });
      if (owners <= 1) {
        throw new BadRequestException(
          'Il doit rester au moins un Propriétaire actif.',
        );
      }
    }

    if (dto.full_name !== undefined) admin.full_name = dto.full_name.trim();
    if (dto.role !== undefined) admin.role = dto.role;
    const disabling = dto.status === 'disabled' && admin.status !== 'disabled';
    if (dto.status !== undefined) admin.status = dto.status;
    await this.admins.save(admin);
    if (disabling || dto.role !== undefined) {
      // Révoque les sessions : rôle/statut relus au prochain login.
      await this.admins.increment({ id }, 'token_version', 1);
    }

    PlatformAuditContext.set({
      action: disabling ? 'admin.disable' : 'admin.update',
      targetType: 'platform_admin',
      targetId: id,
      before,
      after: this.auth.toPublic(admin),
    });
    return this.auth.toPublic(admin);
  }

  async resendAccess(id: number) {
    const admin = await this.admins
      .createQueryBuilder('a')
      .addSelect('a.password')
      .where('a.id = :id', { id })
      .getOne();
    if (!admin) throw new NotFoundException('Compte plateforme introuvable.');
    if (admin.status !== 'active') {
      throw new BadRequestException('Compte désactivé.');
    }
    const purpose = admin.password ? 'reset_password' : 'invite';
    await this.auth.sendAccessLink(admin, purpose);
    PlatformAuditContext.set({
      action: purpose === 'invite' ? 'admin.invite_resent' : 'admin.password_reset_sent',
      targetType: 'platform_admin',
      targetId: id,
    });
    return { success: true, purpose };
  }
}
