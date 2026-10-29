import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { businessRole } from 'src/core/auth/business-role';
import { UserRole } from 'src/core/enums/user-role.enum';
import { enumValue } from 'src/core/shared/utils/enum-value';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { readSidebarBadgesEnabled } from '../platform/settings/cabinet-sidebar.setting';
import {
  DossierLifecyclePhase,
  WorkflowEngine,
} from '../case-workflow/case-workflow.enums';
import { DangerLevel, Dossier } from '../dossiers/entities/dossier.entity';
import { ACTIVE_DOSSIER_STATUSES } from '../dossiers/dossier-stats.service';
import {
  addDossierVisibilityCondition,
  addRelatedDossierVisibilityCondition,
} from '../dossiers/dossier-visibility';
import type { DossierScopeUser } from '../dossiers/dossier-role-scope';
import { Audience, AudienceStatus } from '../audiences/entities/audience.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentCustomerStatus } from '../documents/document-customer/dto/document-customer-response.dto';
import { SidebarCountsCache } from './sidebar-counts.cache';
import {
  EMPTY_SIDEBAR_COUNTS,
  SidebarCountKey,
  SidebarCountsDto,
} from './sidebar-counts.dto';

/** Durée de vie du cache, par cabinet et par utilisateur. */
export const SIDEBAR_COUNTS_TTL_SECONDS = 60;

/** Droit de lecture exigé pour voir chaque compteur. */
const REQUIRED_PERMISSION: Record<SidebarCountKey, string> = {
  dossiersUrgents: 'view_dossiers',
  audiencesDuJour: 'view_audiences',
  audiencesEnCours: 'view_audiences',
  facturesImpayees: 'view_factures',
  documentsEnAttente: 'view_documents',
};

export interface SidebarCountsUser extends DossierScopeUser {
  userId?: number | null;
  permissions?: string[];
}

/**
 * Statut « en cours » des audiences : posé par le module audiences
 * (`AudienceStatus.IN_PROGRESS = 4`). Tant qu'il n'existe pas dans l'enum,
 * il n'y a rien à compter.
 */
export function audienceInProgressStatus(): AudienceStatus | null {
  const value = (AudienceStatus as unknown as Record<string, unknown>)[
    'IN_PROGRESS'
  ];
  return typeof value === 'number' ? (value as AudienceStatus) : null;
}

const userIdOf = (user: SidebarCountsUser): number =>
  Number(user.userId ?? user.id ?? 0);

/**
 * Compteurs de la sidebar : une requête COUNT ciblée par badge, jamais les
 * listes ni les agrégats du tableau de bord. Les critères reprennent ceux des
 * chips « À surveiller » (DossierStatsService.urgentDossiersQuery,
 * FactureStatsService.unpaidQuery, DocumentStatsService.pendingQuery) afin que
 * le badge et la liste ouverte ne divergent pas — avec en plus la portée par
 * rôle des dossiers (`dossierRoleScope`) : un avocat ne compte que les siens.
 */
@Injectable()
export class SidebarCountsService {
  private readonly logger = new Logger(SidebarCountsService.name);

  constructor(
    @InjectRepository(Dossier) private readonly dossiers: Repository<Dossier>,
    @InjectRepository(Audience) private readonly audiences: Repository<Audience>,
    @InjectRepository(Facture) private readonly factures: Repository<Facture>,
    @InjectRepository(DocumentCustomer)
    private readonly documents: Repository<DocumentCustomer>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly cache: SidebarCountsCache,
  ) {}

  async getCounts(
    user: SidebarCountsUser,
    cabinetId: number,
  ): Promise<SidebarCountsDto> {
    // Interrupteur plateforme relu à chaque appel (clé primaire) : couper les
    // badges est effectif immédiatement, sans attendre l'expiration du cache.
    if (!(await readSidebarBadgesEnabled(this.db, cabinetId))) {
      return { enabled: false, ...EMPTY_SIDEBAR_COUNTS };
    }

    const key = `sidebar-counts:${cabinetId}:${userIdOf(user)}`;
    const cached = await this.cache.get<Record<SidebarCountKey, number>>(key);
    if (cached) return { ...EMPTY_SIDEBAR_COUNTS, ...cached, enabled: true };

    const counts = await this.compute(user);
    await this.cache.set(key, counts, SIDEBAR_COUNTS_TTL_SECONDS);
    return { enabled: true, ...counts };
  }

  /** Compteurs que l'appelant a le droit de voir (les autres restent à 0). */
  allowedKeys(user: SidebarCountsUser): SidebarCountKey[] {
    // Le portail client n'a pas de sidebar de gestion.
    if (user.role === UserRole.CLIENT) return [];
    const seesAll =
      user.role === UserRole.ADMIN ||
      user.permissions?.includes('SUPER_ADMIN') === true;
    return (Object.keys(REQUIRED_PERMISSION) as SidebarCountKey[]).filter(
      (key) => seesAll || user.permissions?.includes(REQUIRED_PERMISSION[key]),
    );
  }

  private async compute(
    user: SidebarCountsUser,
  ): Promise<Record<SidebarCountKey, number>> {
    const allowed = new Set(this.allowedKeys(user));
    const counts = { ...EMPTY_SIDEBAR_COUNTS };

    const safely = async (key: SidebarCountKey, load: () => Promise<number>) => {
      if (!allowed.has(key)) return;
      try {
        counts[key] = await load();
      } catch (error: any) {
        // Un badge en panne ne doit pas casser les autres ni la navigation.
        this.logger.warn(
          `Compteur ${key} indisponible: ${error?.message ?? error}`,
        );
      }
    };

    await Promise.all([
      safely('dossiersUrgents', () => this.countUrgentDossiers(user)),
      safely('audiencesDuJour', () => this.countAudiencesToday(user)),
      safely('audiencesEnCours', () => this.countAudiencesInProgress(user)),
      safely('facturesImpayees', () => this.countUnpaidInvoices(user)),
      safely('documentsEnAttente', () => this.countPendingDocuments(user)),
    ]);
    return counts;
  }

  /**
   * Portée par rôle d'une entité rattachée à un dossier (`dossier_id`),
   * équivalent SQL de `dossierRoleScope` : un avocat ne voit que ses dossiers.
   */
  private applyRoleScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    user: SidebarCountsUser,
  ): SelectQueryBuilder<T> {
    if (businessRole(user) !== UserRole.AVOCAT) return qb;
    return qb.andWhere(
      `${alias}.dossier_id IN (SELECT dl.id FROM dossiers dl WHERE dl.lawyer_id = :__scopeLawyerId)`,
      { __scopeLawyerId: userIdOf(user) || -1 },
    );
  }

  private countUrgentDossiers(user: SidebarCountsUser): Promise<number> {
    const qb = this.dossiers
      .createQueryBuilder('dossier')
      .where(
        '(dossier.workflow_engine = :v2Engine OR dossier.status IN (:...activeStatuses))',
        {
          v2Engine: WorkflowEngine.ACTIONS_V2,
          activeStatuses: ACTIVE_DOSSIER_STATUSES,
        },
      )
      .andWhere('dossier.lifecycle_phase != :closedPhase', {
        closedPhase: DossierLifecyclePhase.CLOSED,
      })
      .andWhere(
        '(dossier.danger_level IN (:...highLevels) OR dossier.priority_level >= :highPriority)',
        {
          highLevels: [DangerLevel.Eleve, DangerLevel.Critique].map(enumValue),
          highPriority: 2,
        },
      );
    addTenantCondition(qb, 'dossier');
    addDossierVisibilityCondition(qb, 'dossier');
    if (businessRole(user) === UserRole.AVOCAT) {
      qb.andWhere('dossier.lawyer_id = :__scopeLawyerId', {
        __scopeLawyerId: userIdOf(user) || -1,
      });
    }
    return qb.getCount();
  }

  private countAudiencesToday(user: SidebarCountsUser): Promise<number> {
    const inProgress = audienceInProgressStatus();
    const statuses = [
      AudienceStatus.SCHEDULED,
      ...(inProgress === null ? [] : [inProgress]),
    ];
    const qb = this.audiences
      .createQueryBuilder('audience')
      // `audience_date` est une DATE : comparée au jour courant du serveur.
      .where('audience.audience_date = CURDATE()')
      .andWhere('audience.status IN (:...statuses)', {
        statuses: statuses.map(enumValue),
      });
    return this.finish(qb, 'audience', user);
  }

  private async countAudiencesInProgress(
    user: SidebarCountsUser,
  ): Promise<number> {
    const inProgress = audienceInProgressStatus();
    if (inProgress === null) return 0;
    const qb = this.audiences
      .createQueryBuilder('audience')
      .where('audience.status = :status', { status: enumValue(inProgress) });
    return this.finish(qb, 'audience', user);
  }

  private countUnpaidInvoices(user: SidebarCountsUser): Promise<number> {
    const qb = this.factures
      .createQueryBuilder('facture')
      .where('facture.status != :status', {
        status: enumValue(StatutFacture.PAYEE),
      })
      .andWhere('facture.status != :brouillon', {
        brouillon: enumValue(StatutFacture.BROUILLON),
      })
      .andWhere('facture.status != :cancelled', {
        cancelled: enumValue(StatutFacture.ANNULEE),
      });
    return this.finish(qb, 'facture', user);
  }

  private countPendingDocuments(user: SidebarCountsUser): Promise<number> {
    const qb = this.documents
      .createQueryBuilder('document')
      .where('document.status = :status', {
        status: enumValue(DocumentCustomerStatus.PENDING),
      });
    return this.finish(qb, 'document', user);
  }

  /** Tenant + confidentialité + portée par rôle, puis COUNT. */
  private finish<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    user: SidebarCountsUser,
  ): Promise<number> {
    addTenantCondition(qb, alias);
    addRelatedDossierVisibilityCondition(qb, alias);
    this.applyRoleScope(qb, alias, user);
    return qb.getCount();
  }
}
