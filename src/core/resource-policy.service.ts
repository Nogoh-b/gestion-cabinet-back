import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getCurrentTenantId } from './tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  DossierMember,
  DossierMemberRole,
} from 'src/modules/dossiers/entities/dossier-member.entity';

export interface ResourceActor {
  id?: number;
  userId?: number;
  tenantId: number;
  role?: string;
  permissions?: string[];
  customerId?: number | null;
}

export type ResourceAccessMode = 'read' | 'write' | 'override';

@Injectable()
export class ResourcePolicyService {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(DossierMember)
    private readonly memberRepository: Repository<DossierMember>,
  ) {}

  async assertDossierAccess(
    dossierId: number,
    actor: ResourceActor,
    mode: ResourceAccessMode = 'read',
    requiredPermission?: string,
    resourceConfidentialityLevel = 0,
  ): Promise<{ dossier: Dossier; member: DossierMember | null }> {
    const tenantId = getCurrentTenantId();
    const actorId = Number(actor.userId ?? actor.id);
    if (
      !Number.isInteger(actor.tenantId) ||
      actor.tenantId !== tenantId ||
      !Number.isInteger(actorId)
    ) {
      throw new ForbiddenException('Contexte cabinet ou acteur incohérent');
    }

    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId, tenant_id: tenantId },
      relations: ['lawyer', 'client'],
    });
    if (!dossier) {
      throw new NotFoundException('Dossier introuvable');
    }

    const permissions = actor.permissions ?? [];
    if (
      requiredPermission &&
      actor.role !== 'admin' &&
      !permissions.includes('SUPER_ADMIN') &&
      !permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException('Permission métier insuffisante');
    }

    const member = await this.memberRepository
      .createQueryBuilder('member')
      .where('member.tenant_id = :tenantId', { tenantId })
      .andWhere('member.dossier_id = :dossierId', { dossierId })
      .andWhere('member.user_id = :actorId', { actorId })
      .andWhere('member.revoked_at IS NULL')
      .andWhere('member.valid_from <= UTC_TIMESTAMP()')
      .andWhere(
        '(member.valid_until IS NULL OR member.valid_until > UTC_TIMESTAMP())',
      )
      .getOne();

    const isAdmin =
      actor.role === 'admin' || permissions.includes('SUPER_ADMIN');
    const isClient =
      actor.customerId != null &&
      Number((dossier.client as any)?.id) === Number(actor.customerId);
    const isResponsible = Number(dossier.lawyer?.id) === actorId;
    const hasOverride =
      isAdmin || permissions.includes('dossier_confidential_override');

    if (
      !isAdmin &&
      !isClient &&
      !member &&
      !isResponsible
    ) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce dossier");
    }
    if (
      dossier.confidentiality_level &&
      !isClient &&
      !isResponsible &&
      !hasOverride &&
      (!member || member.confidentialityLevel < 1)
    ) {
      throw new ForbiddenException('Accès confidentiel refusé');
    }
    if (
      resourceConfidentialityLevel > 0 &&
      !isAdmin &&
      !isResponsible &&
      !hasOverride &&
      (isClient ||
        !member ||
        member.confidentialityLevel < resourceConfidentialityLevel)
    ) {
      throw new ForbiddenException(
        'Niveau de confidentialité insuffisant pour cette ressource',
      );
    }
    if (
      mode !== 'read' &&
      !isAdmin &&
      !isResponsible &&
      member?.role === DossierMemberRole.OBSERVER
    ) {
      throw new ForbiddenException('Un observateur dispose uniquement de la lecture');
    }
    if (mode === 'override' && !hasOverride) {
      throw new ForbiddenException('Droit de dérogation requis');
    }

    return { dossier, member };
  }

  async canAccessDossierResource(
    dossierId: number,
    actor: ResourceActor,
    requiredPermission: string,
    resourceConfidentialityLevel = 0,
  ): Promise<boolean> {
    try {
      await this.assertDossierAccess(
        dossierId,
        actor,
        'read',
        requiredPermission,
        resourceConfidentialityLevel,
      );
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        return false;
      }
      throw error;
    }
  }

  async assertProcedureInstanceAccess(
    instanceId: string,
    actor: ResourceActor,
    mode: ResourceAccessMode = 'read',
    requiredPermission?: string,
  ): Promise<{ dossier: Dossier; member: DossierMember | null }> {
    const tenantId = getCurrentTenantId();
    const dossier = await this.dossierRepository.findOne({
      where: { procedureInstanceId: instanceId, tenant_id: tenantId },
      select: ['id'],
    });
    if (!dossier) {
      throw new NotFoundException(
        "Aucun dossier du cabinet n'est rattaché à cette instance",
      );
    }
    return this.assertDossierAccess(
      dossier.id,
      actor,
      mode,
      requiredPermission,
    );
  }

  async getAccessibleProcedureInstanceIds(
    actor: ResourceActor,
  ): Promise<string[]> {
    const dossierIds = await this.getAccessibleDossierIds(actor);
    if (dossierIds.length === 0) return [];
    const rows = await this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.procedureInstanceId', 'instanceId')
      .where('dossier.id IN (:...dossierIds)', { dossierIds })
      .andWhere('dossier.procedureInstanceId IS NOT NULL')
      .getRawMany<{ instanceId: string }>();
    return rows.map((row) => row.instanceId).filter(Boolean);
  }

  async getAccessibleDossierIds(actor: ResourceActor): Promise<number[]> {
    return this.getAccessibleDossierIdsAtLevel(actor, 0);
  }

  async getAccessibleDossierIdsAtLevel(
    actor: ResourceActor,
    resourceConfidentialityLevel: number,
  ): Promise<number[]> {
    const tenantId = getCurrentTenantId();
    const actorId = Number(actor.userId ?? actor.id);
    if (actor.tenantId !== tenantId || !Number.isInteger(actorId)) {
      throw new ForbiddenException('Contexte cabinet ou acteur incohérent');
    }
    const permissions = actor.permissions ?? [];
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.id', 'dossierId')
      .where('dossier.tenant_id = :tenantId', { tenantId });

    if (actor.role !== 'admin' && !permissions.includes('SUPER_ADMIN')) {
      query
        .leftJoin(
          DossierMember,
          'member',
          `member.dossier_id = dossier.id
           AND member.tenant_id = dossier.tenant_id
           AND member.user_id = :actorId
           AND member.revoked_at IS NULL
           AND member.valid_from <= UTC_TIMESTAMP()
           AND (member.valid_until IS NULL OR member.valid_until > UTC_TIMESTAMP())`,
          { actorId },
        )
        .andWhere(
          resourceConfidentialityLevel > 0
            ? `(
                dossier.lawyer_id = :actorId
                OR (
                  member.id IS NOT NULL
                  AND member.confidentiality_level >= :resourceLevel
                )
              )`
            : `(
                dossier.lawyer_id = :actorId
                OR (
                  member.id IS NOT NULL
                  AND (
                    dossier.confidentiality_level = 0
                    OR member.confidentiality_level >= 1
                  )
                )
                OR (:customerId IS NOT NULL AND dossier.client_id = :customerId)
              )`,
          {
            actorId,
            customerId: actor.customerId ?? null,
            resourceLevel: resourceConfidentialityLevel,
          },
        );
    }

    const rows = await query.distinct(true).getRawMany<{ dossierId: string }>();
    return rows.map((row) => Number(row.dossierId)).filter(Number.isInteger);
  }
}
