// src/modules/dashboard/dashboard-watchlist.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { DossierActionStatus } from '../case-workflow/case-workflow.enums';
import { getActionDeadlineState } from '../case-workflow/case-workflow.logic';
import { DangerLevel, Dossier } from '../dossiers/entities/dossier.entity';
import {
  addRelatedDossierVisibilityCondition,
  canBypassConfidentiality,
} from '../dossiers/dossier-visibility';
import { DossierStatsService } from '../dossiers/dossier-stats.service';
import { FactureStatsService } from '../facture/facture-stats.service';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import { AudienceStatsService } from '../audiences/audience-stats.service';
import { Audience } from '../audiences/entities/audience.entity';
import { DocumentStatsService } from '../documents/document-customer/document-stats.service';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { User } from '../iam/user/entities/user.entity';
import {
  WatchlistItemDto,
  WatchlistPageDto,
  WatchlistType,
} from './dto/watchlist.dto';

const DAY_MS = 86_400_000;

/** Actions encore ouvertes : ni terminées ni annulées. */
const OPEN_ACTION_STATUSES = [
  DossierActionStatus.TODO,
  DossierActionStatus.IN_PROGRESS,
  DossierActionStatus.ON_HOLD,
];

const FACTURE_STATUS_BADGES: Partial<
  Record<StatutFacture, WatchlistItemDto['badge']>
> = {
  [StatutFacture.ENVOYEE]: { label: 'Envoyée', tone: 'info' },
  [StatutFacture.PARTIELLEMENT_PAYEE]: {
    label: 'Partiellement payée',
    tone: 'warning',
  },
  [StatutFacture.IMPAYEE]: { label: 'Impayée', tone: 'error' },
};

/** Jour calendaire local `YYYY-MM-DD` d'une colonne DATE (Date ou chaîne). */
function localDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' • ');
}

/**
 * Listes complètes derrière les chips « À surveiller » du tableau de bord.
 *
 * Chaque type réutilise EXACTEMENT la requête de son compteur (méthodes
 * `*Query` des services de statistiques) : le nombre affiché sur le chip et
 * le total de la page sont calculés par la même clause WHERE.
 */
@Injectable()
export class DashboardWatchlistService {
  constructor(
    @InjectRepository(DossierAction)
    private readonly actionRepository: Repository<DossierAction>,
    private readonly dossierStatsService: DossierStatsService,
    private readonly factureStatsService: FactureStatsService,
    private readonly audienceStatsService: AudienceStatsService,
    private readonly documentStatsService: DocumentStatsService,
  ) {}

  async list(
    type: WatchlistType,
    page: number,
    limit: number,
  ): Promise<WatchlistPageDto> {
    const [items, total] = await this.load(type, page, limit);
    return { type, items, total, page, limit };
  }

  /** Nombre d'actions de dossier dont l'échéance est dépassée. */
  async countOverdueActions(): Promise<number> {
    return this.overdueActionsQuery().getCount();
  }

  private async load(
    type: WatchlistType,
    page: number,
    limit: number,
  ): Promise<[WatchlistItemDto[], number]> {
    switch (type) {
      case 'dossiers-urgents': {
        const [rows, total] = await this.dossierStatsService.listUrgentDossiers(
          page,
          limit,
        );
        return [rows.map((d) => this.toDossierItem(d)), total];
      }
      case 'actions-en-retard': {
        const [rows, total] = await this.overdueActionsQuery()
          .leftJoinAndMapOne(
            'action.dossier',
            Dossier,
            'dossier',
            'dossier.id = action.dossier_id',
          )
          .leftJoinAndSelect('dossier.client', 'client')
          .leftJoinAndMapOne(
            'action.responsible',
            User,
            'responsible',
            'responsible.id = action.responsible_user_id',
          )
          .orderBy('action.due_at', 'ASC')
          .skip((page - 1) * limit)
          .take(limit)
          .getManyAndCount();
        return [rows.map((a) => this.toActionItem(a)), total];
      }
      case 'factures-impayees': {
        const [rows, total] = await this.factureStatsService.listUnpaid(
          page,
          limit,
        );
        return [rows.map((f) => this.toFactureItem(f)), total];
      }
      case 'documents-en-attente': {
        const [rows, total] = await this.documentStatsService.listPending(
          page,
          limit,
        );
        return [rows.map((d) => this.toDocumentItem(d)), total];
      }
      case 'audiences-a-venir': {
        const [rows, total] =
          await this.audienceStatsService.listUpcomingAudiences(page, limit);
        return [rows.map((a) => this.toAudienceItem(a)), total];
      }
    }
  }

  /**
   * Actions ouvertes à échéance dépassée — même critère que le suivi du
   * workflow (`getActionDeadlineState`). La confidentialité suit celle des
   * statistiques financières : dossiers confidentiels exclus par défaut pour
   * l'administration, visibilité individuelle pour les autres.
   */
  private overdueActionsQuery(): SelectQueryBuilder<DossierAction> {
    const query = this.actionRepository
      .createQueryBuilder('action')
      .where('action.status IN (:...openStatuses)', {
        openStatuses: OPEN_ACTION_STATUSES,
      })
      .andWhere('action.due_at < :now', { now: new Date() });

    addTenantCondition(query, 'action');

    if (canBypassConfidentiality()) {
      return query.andWhere(
        `action.dossier_id IN (
           SELECT d.id FROM dossiers d WHERE d.confidentiality_level = false
         )`,
      );
    }
    return addRelatedDossierVisibilityCondition(
      query,
      'action',
      'dossier_id',
      false,
    );
  }

  private toDossierItem(d: Dossier): WatchlistItemDto {
    const badge: WatchlistItemDto['badge'] =
      d.danger_level === DangerLevel.Critique
        ? { label: 'Danger critique', tone: 'error' }
        : d.danger_level === DangerLevel.Eleve
          ? { label: 'Danger élevé', tone: 'orange' }
          : { label: 'Prioritaire', tone: 'warning' };
    return {
      id: d.id,
      title: d.object || d.dossier_number,
      subtitle: joinParts([d.dossier_number, d.client?.full_name]),
      date: d.opening_date ?? null,
      badge,
      href: `/dossiers/${d.id}`,
    };
  }

  private toActionItem(
    a: DossierAction & { dossier?: Dossier; responsible?: User },
  ): WatchlistItemDto {
    const { overdueDays } = getActionDeadlineState(a);
    return {
      id: a.id,
      title: a.title,
      subtitle: joinParts([
        a.dossier?.dossier_number,
        a.dossier?.client?.full_name,
        a.responsible?.full_name,
      ]),
      date: a.due_at,
      badge: {
        label: `En retard de ${overdueDays} j`,
        tone: overdueDays > 7 ? 'error' : 'warning',
      },
      href: `/dossiers/${a.dossier_id}/actions`,
    };
  }

  private toFactureItem(f: Facture): WatchlistItemDto {
    const dueDay = localDay(f.dateEcheance);
    const isOverdue = !!dueDay && dueDay < (localDay(new Date()) as string);
    const amount = Number(f.montantTTC ?? 0).toLocaleString('fr-FR');
    return {
      id: f.id,
      title: `Facture ${f.numero}`,
      subtitle: joinParts([
        f.client?.full_name,
        f.dossier?.dossier_number,
        `${amount} ${f.currency || ''}`.trim(),
      ]),
      date: dueDay,
      badge: isOverdue
        ? { label: 'Échue', tone: 'error' }
        : (FACTURE_STATUS_BADGES[f.status] ?? null),
      href: `/facturation/factures/${f.id}`,
    };
  }

  private toDocumentItem(d: DocumentCustomer): WatchlistItemDto {
    const uploadedAt = d.uploaded_at ? new Date(d.uploaded_at) : null;
    const days = uploadedAt
      ? Math.max(0, Math.floor((Date.now() - uploadedAt.getTime()) / DAY_MS))
      : 0;
    return {
      id: d.id,
      title: d.name,
      subtitle: joinParts([
        d.document_type?.name,
        d.dossier?.dossier_number,
        d.dossier?.client?.full_name,
      ]),
      date: uploadedAt,
      badge: {
        label: days > 0 ? `En attente depuis ${days} j` : 'Reçu aujourd’hui',
        tone: days > 7 ? 'warning' : 'info',
      },
      href: `/documents/${d.id}`,
    };
  }

  private toAudienceItem(a: Audience): WatchlistItemDto {
    const day = localDay(a.audience_date);
    const time = a.audience_time || null;
    const today = localDay(new Date()) as string;
    const daysUntil = day
      ? Math.round(
          (new Date(`${day}T00:00:00`).getTime() -
            new Date(`${today}T00:00:00`).getTime()) /
            DAY_MS,
        )
      : null;
    return {
      id: a.id,
      title: a.audience_type?.name
        ? `Audience — ${a.audience_type.name}`
        : 'Audience',
      subtitle: joinParts([
        a.dossier?.dossier_number,
        a.dossier?.client?.full_name,
        a.jurisdiction?.name,
        a.room ? `Salle ${a.room}` : null,
      ]),
      date: day ? (time ? `${day}T${time.slice(0, 5)}` : day) : null,
      badge:
        daysUntil === null
          ? null
          : daysUntil === 0
            ? { label: "Aujourd'hui", tone: 'error' }
            : daysUntil === 1
              ? { label: 'Demain', tone: 'warning' }
              : { label: `Dans ${daysUntil} j`, tone: 'primary' },
      href: `/audiences/${a.id}`,
    };
  }
}
