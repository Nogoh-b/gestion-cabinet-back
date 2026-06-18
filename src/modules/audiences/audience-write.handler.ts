// src/modules/audiences/audience-write.handler.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Audience, AudienceStatus, AudienceType1 } from './entities/audience.entity';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService, ResolveConfig } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';
import { AmbiguityException } from 'src/core/ai-database/write/ambiguity.exception';

/**
 * Handler custom pour les audiences.
 * Logique métier :
 *   - dossier + jurisdiction + date + heure obligatoires
 *   - Format heure HH:MM
 *   - Status par défaut : SCHEDULED
 *   - Transitions automatiques :
 *     · status=HELD sans decision_date → today
 *     · status=POSTPONED → vérifier postponed_to
 */
@Injectable()
export class AudienceWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
  ) {
    super('audiences', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      dossier_id: { description: 'ID du dossier. Peut fournir "dossier" avec son numéro.', required: true },
      jurisdiction_id: { description: 'ID du tribunal. Peut fournir "jurisdiction" avec le nom.', required: true },
      audience_date: { description: 'Date (YYYY-MM-DD)', example: '2026-06-15', required: true },
      audience_time: { description: 'Heure (HH:MM)', example: '14:30', required: true },
      type: { description: '0=Plaidoirie, 1=Délibération, 2=Jugement, 3=Conciliation', example: '0' },
      status: { description: '0=Programmée, 1=Tenue, 2=Reportée, 3=Annulée', example: '0' },
      judge_name: { description: 'Nom du juge', example: 'Madame la Présidente Dupont' },
      room: { description: 'Salle d\'audience', example: 'Salle 14' },
      reason: { description: 'Motif du report ou de l\'annulation', example: 'Affaire renvoyee pour communication de pieces' },
      report_content: { description: 'Proces-verbal ou rapport d\'audience. Obligatoire avant un report.', example: 'L\'audience s\'est tenue. L\'affaire est renvoyee a une date ulterieure pour depot de conclusions.' },
      report_date: { description: 'Date de redaction du rapport', example: '2026-06-16' },
      postponed_to: { description: 'Nouvelle date et heure complete si l\'audience est reportee', example: '2026-07-03 09:00:00' },
      outcome: { description: 'Issue metier de l\'audience', example: 'postponed' },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    return fields;
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const derivedReason = !fields.reason && fields.report_content
      ? String(fields.report_content).trim()
      : fields.reason;
    if (operation === 'INSERT') {
      if (!fields.dossier_id) errors.push('Le dossier est requis (dossier_id ou dossier)');
      if (!fields.jurisdiction_id) errors.push('La juridiction est requise (jurisdiction_id ou jurisdiction)');
      if (!fields.audience_date) errors.push('La date d\'audience est requise (audience_date)');
      if (!fields.audience_time) errors.push('L\'heure d\'audience est requise (audience_time, format HH:MM)');
    }
    if (fields.audience_time && !/^\d{1,2}:\d{2}$/.test(String(fields.audience_time))) {
      errors.push('Le format de l\'heure doit être HH:MM (ex: 14:30)');
    }
    if (Number(fields.status) === AudienceStatus.POSTPONED) {
      if (!fields.report_content || String(fields.report_content).trim().length === 0) {
        errors.push('Le rapport d\'audience est obligatoire pour reporter une audience (report_content)');
      }
      if (!derivedReason || String(derivedReason).trim().length === 0) {
        errors.push('Le motif du report est obligatoire (reason)');
      }
      // ⚠️ La nouvelle date du renvoi n'est PLUS obligatoire : un renvoi peut être
      // « à une date ultérieure (à fixer) ». Si elle est fournie (postponed_to ou
      // audience_date + audience_time), doUpdate crée l'audience de remplacement ;
      // sinon l'audience est simplement marquée « Reportée » avec son motif.
    }
    return {
      valid: errors.length === 0,
      errors,
      transformedFields: {
        ...fields,
        ...(derivedReason ? { reason: String(derivedReason).trim() } : {}),
      },
    };
  }

  // ── Résolution des dépendances : propose top 10 juridictions si absentes ──

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    createdEntities?: Map<string, any>,
    config?: ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved = await super.resolveDependencies(fields, userId, createdEntities, config);
    const isLikelyUpdateWithoutSchedulingContext =
      !resolved.dossier_id &&
      !resolved.jurisdiction_id &&
      !resolved.audience_date &&
      !resolved.audience_time;

    // Auto-injection du contexte de stage visit courant
    if (resolved.dossier_id) {
      const stageInfo = await this.fetchCurrentStageVisitInfo(resolved.dossier_id);
      if (stageInfo) {
        if (!resolved.procedure_instance_id) resolved.procedure_instance_id = stageInfo.procedure_instance_id;
        if (!resolved.stageVisit_id && stageInfo.stage_visit_id) resolved.stageVisit_id = stageInfo.stage_visit_id;
        if (!resolved.sub_stage_visit_id && stageInfo.sub_stage_visit_id) resolved.sub_stage_visit_id = stageInfo.sub_stage_visit_id;
      }
    }

    // La juridiction d'une audience est déduite du dossier par défaut.
    if (!resolved.jurisdiction_id && resolved.dossier_id) {
      const dossierJurisdictionId = await this.fetchDossierJurisdictionId(resolved.dossier_id);
      if (dossierJurisdictionId) {
        this.logger.log(`⚖️ jurisdiction déduite du dossier ${resolved.dossier_id} → ${dossierJurisdictionId}`);
        resolved.jurisdiction_id = dossierJurisdictionId;
      }
    }

    // En dernier recours seulement (dossier sans juridiction), on propose un choix.
    if (!resolved.jurisdiction_id && !isLikelyUpdateWithoutSchedulingContext) {
      const jurisdictions = await this.fetchTopJurisdictions();
      if (jurisdictions.length > 0) {
        this.logger.warn(`🔍 jurisdiction manquante — proposition de ${jurisdictions.length} juridictions`);
        throw new AmbiguityException('jurisdictions', 'jurisdiction', '(non spécifiée)', jurisdictions, -1, this.entityName);
      }
    }

    return resolved;
  }

  /** Récupère la juridiction rattachée au dossier (jurisdiction_id) */
  private async fetchDossierJurisdictionId(dossierId: any): Promise<number | null> {
    try {
      const row = await this.dataSource
        .getRepository('dossiers')
        .createQueryBuilder('d')
        .select('d.jurisdiction_id', 'jurisdiction_id')
        .where('d.id = :id', { id: dossierId })
        .getRawOne();
      return row?.jurisdiction_id ?? null;
    } catch (err) {
      this.logger.error(`Erreur récupération juridiction du dossier: ${(err as Error).message}`);
      return null;
    }
  }

  /** Récupère les 10 premières juridictions actives (ordre alphabétique) */
  private async fetchTopJurisdictions(): Promise<Array<{ id: any; label: string; score: number; data: any }>> {
    try {
      const rows = await this.dataSource
        .getRepository('jurisdictions')
        .createQueryBuilder('j')
        .orderBy('j.name', 'ASC')
        .limit(10)
        .getMany();
      return rows.map((j: any) => ({
        id: j.id,
        label: `${j.name}${j.code ? ` (${j.code})` : ''}${j.city ? ` — ${j.city}` : ''}`,
        score: 0,
        data: j,
      }));
    } catch (err) {
      this.logger.error(`Erreur récupération juridictions: ${(err as Error).message}`);
      return [];
    }
  }

  protected async doInsert(fields: Record<string, any>, userId: string): Promise<WriteResult> {
    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));

    const data = {
      ...safeFields,
      audience_date: new Date(safeFields.audience_date),
      type: safeFields.type !== undefined ? Number(safeFields.type) : AudienceType1.HEARING,
      status: safeFields.status !== undefined ? Number(safeFields.status) : AudienceStatus.SCHEDULED,
      reminder_sent: safeFields.reminder_sent ?? false,
    };

    const record = this.audienceRepo.create(data);
    const saved = await this.audienceRepo.save(record) as unknown as Audience;

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
    const audience = await this.audienceRepo.findOne({ where: { id: entityId as any } });
    if (!audience) throw new NotFoundException(`Audience ${entityId} introuvable`);

    const safeFields = this.stripAutoGeneratedFields(this.filterKnownColumns(fields));

    if (Number(safeFields.status) === AudienceStatus.POSTPONED) {
      if (audience.status === AudienceStatus.POSTPONED) {
        throw new BadRequestException(`Audience ${entityId} deja reportee`);
      }

      const reportContent = typeof safeFields.report_content === 'string'
        ? safeFields.report_content.trim()
        : '';
      const reason = typeof safeFields.reason === 'string'
        ? safeFields.reason.trim()
        : reportContent;
      const postponedDate = safeFields.postponed_to
        ? new Date(safeFields.postponed_to)
        : (safeFields.audience_date ? new Date(safeFields.audience_date) : null);
      const postponedTime = safeFields.audience_time
        ? String(safeFields.audience_time)
        : (postponedDate
            ? `${postponedDate.getHours().toString().padStart(2, '0')}:${postponedDate.getMinutes().toString().padStart(2, '0')}`
            : '');

      // Trace de la décision de report (toujours enregistrée)
      if (reportContent) audience.report_content = reportContent;
      audience.report_date = audience.report_date ?? new Date();
      audience.outcome = safeFields.outcome ? String(safeFields.outcome) : 'postponed';

      // ── Cas A : nouvelle date fournie → renvoi daté + audience de remplacement ──
      if (postponedDate && postponedTime) {
        audience.postpone(postponedDate, postponedTime, reason);
        const savedOriginal = await this.audienceRepo.save(audience);

        const replacement = this.audienceRepo.create({
          audience_date: postponedDate,
          audience_time: postponedTime,
          jurisdiction_id: audience.jurisdiction_id,
          room: safeFields.room ?? audience.room,
          type: audience.type,
          audience_type_id: audience.audience_type_id,
          judge_name: safeFields.judge_name ?? audience.judge_name,
          duration_minutes: safeFields.duration_minutes ?? audience.duration_minutes,
          notes: `Audience issue du report de #${audience.id}. Motif : ${reason || 'non précisé'}`,
          dossier_id: audience.dossier_id,
          status: AudienceStatus.SCHEDULED,
          procedure_instance_id: (audience as any).procedure_instance_id,
          stageVisit_id: (audience as any).stageVisit_id,
          sub_stage_visit_id: (audience as any).sub_stage_visit_id,
          sub_stage_id: (audience as any).sub_stage_id,
          step_id: audience.step_id,
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
