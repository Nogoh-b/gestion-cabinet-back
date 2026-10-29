import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { EntityManager, FindOptionsWhere } from 'typeorm';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Audience, AudienceStatus } from './entities/audience.entity';

export interface PostponeAudienceInput {
  audience_date: string | Date;
  audience_time: string;
  reason?: string;
  report_content?: string;
  report_author_id?: string;
  room?: string;
  judge_name?: string;
  duration_minutes?: number;
}

/** Shared transactional implementation used by every audience postponement entry point. */
export async function postponeAudienceWithManager(
  manager: EntityManager,
  audienceId: number,
  input: PostponeAudienceInput,
): Promise<{ original: Audience; replacement: Audience }> {
  if (!input.audience_date || !input.audience_time) {
    throw new BadRequestException(
      `La nouvelle date et la nouvelle heure de l'audience sont requises pour effectuer un report.`,
    );
  }
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(input.audience_time)) {
    throw new BadRequestException(
      `L'heure de la nouvelle audience doit respecter le format HH:MM.`,
    );
  }

  const repository = manager.getRepository(Audience);
  const audience = await repository.findOne({
    where: { id: audienceId, tenant_id: getCurrentTenantId() },
  });
  if (!audience) {
    throw new NotFoundException(`Audience ${audienceId} introuvable`);
  }
  if (audience.status === AudienceStatus.POSTPONED) {
    throw new BadRequestException(
      `Cette audience a d\u00e9j\u00e0 \u00e9t\u00e9 report\u00e9e.`,
    );
  }
  if (audience.status === AudienceStatus.CANCELLED) {
    throw new BadRequestException(
      `Une audience annul\u00e9e ne peut pas \u00eatre report\u00e9e.`,
    );
  }

  // Rapport facultatif : enregistr\u00e9 s'il accompagne le report.
  const reportContent = input.report_content?.trim();

  const nextDate = new Date(input.audience_date);
  if (Number.isNaN(nextDate.getTime())) {
    throw new BadRequestException(`La nouvelle date d'audience est invalide.`);
  }

  if (reportContent) {
    audience.report_content = reportContent;
    audience.report_date = audience.report_date ?? new Date();
    audience.report_author_id =
      input.report_author_id ?? audience.report_author_id;
  }
  audience.outcome = 'postponed';
  audience.postpone(nextDate, input.audience_time, input.reason?.trim());
  const original = await repository.save(audience);

  const replacement = repository.create({
    tenant_id: audience.tenant_id,
    audience_date: nextDate,
    audience_time: input.audience_time,
    jurisdiction_id: audience.jurisdiction_id,
    room: input.room ?? audience.room,
    type: audience.type,
    audience_type_id: audience.audience_type_id,
    judge_name: input.judge_name ?? audience.judge_name,
    duration_minutes: input.duration_minutes ?? audience.duration_minutes,
    notes: input.reason?.trim()
      ? `Audience issue du report de #${audience.id}. Motif : ${input.reason.trim()}`
      : `Audience issue du report de #${audience.id}.`,
    dossier_id: audience.dossier_id,
    status: AudienceStatus.SCHEDULED,
    procedure_instance_id: audience.procedure_instance_id,
    stageVisit_id: audience.stageVisit_id,
    sub_stage_visit_id: audience.sub_stage_visit_id,
    sub_stage_id: audience.sub_stage_id,
    step_id: audience.step_id,
    parent_audience_id: audience.id,
  });

  return {
    original,
    replacement: await repository.save(replacement),
  };
}

/** Portée de dossier du rôle de l'appelant ({} : aucune restriction). */
export type AudienceDossierScope = FindOptionsWhere<Dossier>;

/** Jour calendaire (AAAA-MM-JJ, heure locale) d'une colonne DATE. */
function dayKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

async function loadScopedAudience(
  manager: EntityManager,
  audienceId: number,
  scope: AudienceDossierScope,
): Promise<Audience> {
  const audience = await manager.getRepository(Audience).findOne({
    where: {
      id: audienceId,
      tenant_id: getCurrentTenantId(),
      // Un avocat n'agit que sur les audiences de ses dossiers.
      ...(Object.keys(scope).length ? { dossier: scope } : {}),
    },
  });
  if (!audience) {
    throw new NotFoundException(`Audience ${audienceId} introuvable`);
  }
  return audience;
}

/** SCHEDULED → IN_PROGRESS : pose le statut « En cours » et `started_at`. */
export async function startAudienceWithManager(
  manager: EntityManager,
  audienceId: number,
  scope: AudienceDossierScope = {},
  now: Date = new Date(),
): Promise<Audience> {
  const audience = await loadScopedAudience(manager, audienceId, scope);
  if (audience.status === AudienceStatus.IN_PROGRESS) {
    throw new BadRequestException(`Cette audience est déjà en cours.`);
  }
  if (audience.status !== AudienceStatus.SCHEDULED) {
    throw new BadRequestException(
      `Seule une audience programmée peut être démarrée (statut actuel : ${audience.status_label}).`,
    );
  }
  if (dayKey(audience.audience_date) > dayKey(now)) {
    throw new BadRequestException(
      `Impossible de démarrer l'audience avant le jour prévu (${dayKey(audience.audience_date)}).`,
    );
  }
  applyAudienceStatusChange(audience, AudienceStatus.IN_PROGRESS, now);
  return manager.getRepository(Audience).save(audience);
}

/** IN_PROGRESS → HELD : pose le statut « Tenue » et `ended_at`. */
export async function finishAudienceWithManager(
  manager: EntityManager,
  audienceId: number,
  scope: AudienceDossierScope = {},
  now: Date = new Date(),
): Promise<Audience> {
  const audience = await loadScopedAudience(manager, audienceId, scope);
  if (audience.status !== AudienceStatus.IN_PROGRESS) {
    throw new BadRequestException(
      `Seule une audience en cours peut être terminée (statut actuel : ${audience.status_label}).`,
    );
  }
  applyAudienceStatusChange(audience, AudienceStatus.HELD, now);
  return manager.getRepository(Audience).save(audience);
}

/**
 * Règles d'entrée/sortie du statut « En cours », partagées par « Démarrer »,
 * « Terminer » et la modification directe du statut (PATCH, outils IA) :
 *   - on n'entre en cours que depuis « Programmée » ;
 *   - sortir vers « Tenue » horodate la fin, revenir à « Programmée »
 *     annule le démarrage ; les autres statuts restent libres.
 */
export function applyAudienceStatusChange(
  audience: Audience,
  next: AudienceStatus | string | number,
  now: Date = new Date(),
): void {
  const target = Number(next) as AudienceStatus;
  const current = Number(audience.status) as AudienceStatus;

  if (target === AudienceStatus.IN_PROGRESS) {
    if (current !== AudienceStatus.SCHEDULED) {
      if (current === AudienceStatus.IN_PROGRESS) return;
      throw new BadRequestException(
        `Seule une audience programmée peut passer « en cours ».`,
      );
    }
    audience.status = AudienceStatus.IN_PROGRESS;
    audience.started_at = now;
    audience.ended_at = null;
    return;
  }

  if (current === AudienceStatus.IN_PROGRESS) {
    if (target === AudienceStatus.HELD) audience.ended_at = now;
    if (target === AudienceStatus.SCHEDULED) audience.started_at = null;
    audience.status = target;
  }
}
