// src/modules/audiences/audience-write.handler.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Audience,
  AudienceStatus,
  AudienceType1,
} from './entities/audience.entity';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import {
  EntityResolverService,
  ResolveConfig,
} from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { parseLenientTime } from 'src/core/ai-database/write/lenient-values';
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';
import { applyAudienceStatusChange } from './audience-workflow';
import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import {
  assertAudienceScheduleAllowed,
  isLateAudienceStart,
  normalizeAudienceSchedule,
  rescheduleAudience,
} from './audience-schedule.util';

/** Jour civil d'une valeur du plan (une `Date` vient d'une date relative, en heure locale). */
function scheduleDay(value: unknown): string {
  if (!(value instanceof Date)) return String(value ?? '').slice(0, 10);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

const lateReasonOf = (fields: Record<string, any>): string =>
  String(fields.late_scheduling_reason || fields.reason || '').trim();

/**
 * Handler custom pour les audiences.
 * Logique métier :
 *   - dossier + date obligatoires ; heure par défaut à 09:00
 *   - Format heure HH:MM
 *   - Status par défaut : SCHEDULED
 *   - Transitions automatiques :
 *     · status=HELD sans decision_date → today
 *     · status=POSTPONED → vérifier postponed_to
 *   - Date : mêmes règles que le formulaire (future, motif et dérogation sous
 *     48 h). Une audience déjà tenue, reportée ou annulée peut être consignée
 *     au passé (reprise de fiches existantes).
 */
@Injectable()
export class AudienceWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
    private readonly permissions: AiDatabasePermissionService,
  ) {
    super('audiences', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      dossier_id: {
        description: 'ID du dossier. Peut fournir "dossier" avec son numéro.',
        required: true,
      },
      jurisdiction_id: {
        description: 'ID du tribunal. Peut fournir "jurisdiction" avec le nom.',
        required: false,
      },
      audience_date: {
        description: 'Date (YYYY-MM-DD)',
        example: '2026-06-15',
        required: true,
      },
      audience_time: {
        description: 'Heure (HH:MM), 09:00 par défaut',
        example: '14:30',
        required: false,
      },
      type: {
        description:
          'BD: 0=HEARING/Plaidoirie, 1=DELIBERATION, 2=JUDGMENT, 3=CONCILIATION.',
        example: '0',
      },
      status: {
        description:
          'BD: 0=SCHEDULED/Programmée, 1=HELD/Tenue, 2=POSTPONED/Reportée, 3=CANCELLED/Annulée.',
        example: '0',
      },
      judge_name: {
        description: 'Nom du juge',
        example: 'Madame la Présidente Dupont',
      },
      room: { description: "Salle d'audience", example: 'Salle 14' },
      reason: {
        description: "Motif du report ou de l'annulation",
        example: 'Affaire renvoyee pour communication de pieces',
      },
      report_content: {
        description:
          "Proces-verbal ou rapport d'audience. Facultatif, y compris pour un report.",
        example:
          "L'audience s'est tenue. L'affaire est renvoyee a une date ulterieure pour depot de conclusions.",
      },
      report_date: {
        description: 'Date de redaction du rapport',
        example: '2026-06-16',
      },
      postponed_to: {
        description:
          "Nouvelle date et heure complete si l'audience est reportee",
        example: '2026-07-03 09:00:00',
      },
      outcome: {
        description: "Issue metier de l'audience",
        example: 'postponed',
      },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    fields.push({
      name: 'late_scheduling_reason',
      label: 'Motif de la création à moins de 48 heures',
      type: 'string',
      required: false,
      description:
        "Obligatoire si l'audience commence dans moins de 48 heures (10 caractères au moins). À reprendre de la demande, jamais à inventer.",
      example: 'Audience fixée en urgence par le greffe ce matin',
    });
    return fields;
  }

  /** Motif à faire saisir dans la carte de confirmation (audience à moins de 48 h). */
  requiredPlanFields(operation: {
    operation?: string;
    fields?: Record<string, any>;
  }): Record<string, string> {
    const fields = operation.fields ?? {};
    if (operation.operation !== 'INSERT' || !fields.audience_date) return {};
    if (lateReasonOf(fields)) return {};
    try {
      const { startsAtUtc } = normalizeAudienceSchedule({
        audience_date: scheduleDay(fields.audience_date),
        audience_time: parseLenientTime(fields.audience_time) || undefined,
      });
      return isLateAudienceStart(startsAtUtc)
        ? { late_scheduling_reason: 'Obligatoire : audience à moins de 48 heures' }
        : {};
    } catch {
      return {};
    }
  }

  /** Mêmes droits que le formulaire, lus depuis le profil de l'utilisateur. */
  private async assertScheduleAllowed(
    startsAtUtc: Date,
    userId: string,
    lateReason: string,
  ): Promise<void> {
    const { isAdmin, permissions } =
      await this.permissions.getAccessProfile(userId);
    assertAudienceScheduleAllowed(
      startsAtUtc,
      {
        role: isAdmin ? 'admin' : undefined,
        permissions: [...permissions.keys()],
      },
      lateReason,
    );
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const transformed = { ...fields };
    if (operation === 'INSERT') {
      if (!fields.dossier_id)
        errors.push('Le dossier est requis (dossier_id ou dossier)');
      if (!fields.audience_date)
        errors.push("La date d'audience est requise (audience_date)");
    }
    // Heure : « 14h30 », « 14:30:00 »… sont acceptés comme dans le formulaire
    // (HH:MM[:SS]) ; une heure illisible est ignorée (09:00 par défaut).
    if (fields.audience_time !== undefined && fields.audience_time !== null) {
      const time = parseLenientTime(fields.audience_time);
      if (time) transformed.audience_time = time;
      else delete transformed.audience_time;
    }
    // Report : comme le report manuel, rien d'autre n'est exigé ; le rapport
    // et le motif sont facultatifs et la nouvelle date peut rester « à fixer ».
    return {
      valid: errors.length === 0,
      errors,
      transformedFields: transformed,
    };
  }

  // ── Résolution des dépendances ────────────────────────────────────────────

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = await super.resolveDependencies(
      fields,
      userId,
      createdEntities,
      config,
    );

    // Auto-injection du contexte de stage visit courant
    if (resolved.dossier_id) {
      const stageInfo = await this.fetchCurrentStageVisitInfo(
        resolved.dossier_id,
      );
      if (stageInfo) {
        if (!resolved.procedure_instance_id)
          resolved.procedure_instance_id = stageInfo.procedure_instance_id;
        if (!resolved.stageVisit_id && stageInfo.stage_visit_id)
          resolved.stageVisit_id = stageInfo.stage_visit_id;
        if (!resolved.sub_stage_visit_id && stageInfo.sub_stage_visit_id)
          resolved.sub_stage_visit_id = stageInfo.sub_stage_visit_id;
      }
    }

    // La juridiction d'une audience est déduite du dossier par défaut.
    if (!resolved.jurisdiction_id && resolved.dossier_id) {
      const dossierJurisdictionId = await this.fetchDossierJurisdictionId(
        resolved.dossier_id,
      );
      if (dossierJurisdictionId) {
        this.logger.log(
          `⚖️ jurisdiction déduite du dossier ${resolved.dossier_id} → ${dossierJurisdictionId}`,
        );
        resolved.jurisdiction_id = dossierJurisdictionId;
      }
    }

    return resolved;
  }

  /** Récupère la juridiction rattachée au dossier (jurisdiction_id) */
  private async fetchDossierJurisdictionId(
    dossierId: any,
  ): Promise<number | null> {
    try {
      const row = await this.dataSource
        .getRepository('dossiers')
        .createQueryBuilder('d')
        .select('d.jurisdiction_id', 'jurisdiction_id')
        .where('d.id = :id', { id: dossierId })
        .getRawOne();
      return row?.jurisdiction_id ?? null;
    } catch (err) {
      this.logger.error(
        `Erreur récupération juridiction du dossier: ${(err as Error).message}`,
      );
      return null;
    }
  }

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const safeFields = this.stripAutoGeneratedFields(
      this.filterKnownColumns(fields),
    );

    const status =
      safeFields.status !== undefined
        ? Number(safeFields.status)
        : AudienceStatus.SCHEDULED;
    const schedule = normalizeAudienceSchedule({
      audience_date: scheduleDay(safeFields.audience_date),
      audience_time: safeFields.audience_time,
    });
    const lateReason = lateReasonOf(fields);
    const late = isLateAudienceStart(schedule.startsAtUtc);
    if (status === AudienceStatus.SCHEDULED) {
      await this.assertScheduleAllowed(
        schedule.startsAtUtc,
        userId,
        lateReason,
      );
    }

    const data = {
      ...safeFields,
      audience_date: schedule.legacyDate as unknown as Date,
      audience_time: schedule.legacyTime,
      starts_at_utc: schedule.startsAtUtc,
      timezone: schedule.timezone,
      notes:
        late && lateReason
          ? [safeFields.notes, `Audience à moins de 48 heures. Motif : ${lateReason}`]
              .filter(Boolean)
              .join('\n')
          : safeFields.notes,
      type:
        safeFields.type !== undefined
          ? Number(safeFields.type)
          : AudienceType1.HEARING,
      status,
      reminder_sent: safeFields.reminder_sent ?? false,
    };

    const record = this.audienceRepo.create(data);
    const saved = (await this.audienceRepo.save(record)) as unknown as Audience;

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Audience programmée le ${new Date(saved.audience_date).toLocaleDateString('fr-FR')} à ${saved.audience_time}`,
    };
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const audience = await this.audienceRepo.findOne({
      where: { id: entityId as any },
    });
    if (!audience)
      throw new NotFoundException(`Audience ${entityId} introuvable`);

    const safeFields = this.stripAutoGeneratedFields(
      this.filterKnownColumns(fields),
    );

    if (Number(safeFields.status) === AudienceStatus.POSTPONED) {
      if (audience.status === AudienceStatus.POSTPONED) {
        throw new BadRequestException(`Audience ${entityId} deja reportee`);
      }

      const reason =
        typeof safeFields.reason === 'string' ? safeFields.reason.trim() : '';
      // Rapport facultatif, comme dans le report manuel : enregistré s'il est fourni.
      const reportContent =
        typeof safeFields.report_content === 'string'
          ? safeFields.report_content.trim()
          : '';
      const postponedDate = safeFields.postponed_to
        ? new Date(safeFields.postponed_to)
        : safeFields.audience_date
          ? new Date(safeFields.audience_date)
          : null;
      const postponedTime = safeFields.audience_time
        ? String(safeFields.audience_time)
        : postponedDate
          ? `${postponedDate.getHours().toString().padStart(2, '0')}:${postponedDate.getMinutes().toString().padStart(2, '0')}`
          : '';

      // Trace de la décision de report (toujours enregistrée)
      if (reportContent) {
        audience.report_content = reportContent;
        audience.report_date = audience.report_date ?? new Date();
      }
      audience.outcome = safeFields.outcome
        ? String(safeFields.outcome)
        : 'postponed';

      // ── Cas A : nouvelle date fournie → renvoi daté + audience de remplacement ──
      if (postponedDate && postponedTime) {
        const schedule = normalizeAudienceSchedule({
          audience_date: scheduleDay(postponedDate),
          audience_time: postponedTime,
          timezone: audience.timezone,
        });
        await this.assertScheduleAllowed(
          schedule.startsAtUtc,
          userId,
          lateReasonOf(fields),
        );
        audience.status = AudienceStatus.POSTPONED;
        audience.audience_date = postponedDate;
        audience.audience_time = postponedTime;
        const savedOriginal = await this.audienceRepo.save(audience);

        const replacement = this.audienceRepo.create({
          audience_date: schedule.legacyDate as unknown as Date,
          audience_time: schedule.legacyTime,
          starts_at_utc: schedule.startsAtUtc,
          timezone: schedule.timezone,
          jurisdiction_id: audience.jurisdiction_id,
          room: safeFields.room ?? audience.room,
          type: audience.type,
          audience_type_id: audience.audience_type_id,
          judge_name: safeFields.judge_name ?? audience.judge_name,
          duration_minutes:
            safeFields.duration_minutes ?? audience.duration_minutes,
          notes: `Audience issue du report de #${audience.id}. Motif : ${reason || 'non précisé'}`,
          dossier_id: audience.dossier_id,
          status: AudienceStatus.SCHEDULED,
          procedure_instance_id: (audience as any).procedure_instance_id,
          stageVisit_id: (audience as any).stageVisit_id,
          sub_stage_visit_id: (audience as any).sub_stage_visit_id,
          sub_stage_id: (audience as any).sub_stage_id,
          parent_audience_id: audience.id,
        } as Partial<Audience>);
        const savedReplacement = await this.audienceRepo.save(replacement);

        return {
          success: true,
          operation: 'UPDATE',
          entityId: savedOriginal.id,
          affected: 2,
          data: {
            original: savedOriginal,
            replacement: savedReplacement,
          },
          message: `Audience ${entityId} reportee. Nouvelle audience creee pour le ${savedReplacement.audience_date} a ${savedReplacement.audience_time}`,
        };
      }

      // ── Cas B : renvoi « à une date ultérieure » (date non fixée) ──
      // On marque l'audience comme reportée avec son motif, sans créer de remplacement.
      audience.status = AudienceStatus.POSTPONED;
      audience.reminder_sent = false;
      if (reason) {
        audience.notes = `${audience.notes || ''}\nReporté: ${reason}`.trim();
      }
      const savedPostponed = await this.audienceRepo.save(audience);

      return {
        success: true,
        operation: 'UPDATE',
        entityId: savedPostponed.id,
        affected: 1,
        data: savedPostponed,
        message: `Audience ${entityId} marquée comme reportée${reason ? ` (motif : ${reason})` : ''}. Nouvelle date à fixer ultérieurement.`,
      };
    }

    if (
      safeFields.audience_date !== undefined ||
      safeFields.audience_time !== undefined
    ) {
      const { schedule, moved } = rescheduleAudience(audience, {
        ...(safeFields.audience_date !== undefined && {
          audience_date: scheduleDay(safeFields.audience_date),
        }),
        audience_time: safeFields.audience_time,
      });
      if (moved) {
        await this.assertScheduleAllowed(
          schedule.startsAtUtc,
          userId,
          lateReasonOf(fields),
        );
        audience.reminder_sent = false;
        audience.reminder_sent_at = null;
      }
      safeFields.audience_date = schedule.legacyDate;
      safeFields.audience_time = schedule.legacyTime;
      audience.starts_at_utc = schedule.startsAtUtc;
      audience.timezone = schedule.timezone;
    }

    // Entrée/sortie du statut « En cours » (mêmes règles que Démarrer/Terminer).
    if (safeFields.status !== undefined && safeFields.status !== null) {
      applyAudienceStatusChange(audience, safeFields.status);
    }
    Object.assign(audience, safeFields);

    // Transitions auto
    if (safeFields.status === AudienceStatus.HELD && !audience.decision_date) {
      audience.decision_date = new Date();
    }

    const saved = await this.audienceRepo.save(audience);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Audience ${entityId} mise à jour`,
    };
  }
}
