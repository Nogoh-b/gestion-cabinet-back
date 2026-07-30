import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { ResourceActor } from 'src/core/resource-policy.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import {
  AddDecisionResponseDto,
  DecisionAudienceDto,
} from './dto/decision-audience.dto';
import {
  Audience,
  AudienceRecordStatus,
  AudienceStatus,
} from './entities/audience.entity';

@Injectable()
export class AudienceDecisionService {
  constructor(
    @InjectRepository(Audience)
    private readonly audienceRepository: Repository<Audience>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async addDecision(
    audienceId: number,
    decisionDto: DecisionAudienceDto,
    actor: ResourceActor,
  ): Promise<AddDecisionResponseDto> {
    return this.saveDecision(audienceId, decisionDto, actor);
  }

  async updateDecision(
    audienceId: number,
    decisionDto: DecisionAudienceDto,
    actor: ResourceActor,
  ): Promise<AddDecisionResponseDto> {
    return this.saveDecision(audienceId, decisionDto, actor);
  }

  private async saveDecision(
    audienceId: number,
    decisionDto: DecisionAudienceDto,
    actor: ResourceActor,
  ): Promise<AddDecisionResponseDto> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const audience = await manager.findOne(Audience, {
        where: { id: audienceId },
        relations: ['decision_documents'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!audience) {
        throw new NotFoundException(
          `Audience avec ID ${audienceId} non trouvée`,
        );
      }
      if (audience.status !== AudienceStatus.HELD) {
        throw new BadRequestException(
          `La décision ne peut être rédigée qu'après la tenue de l'audience`,
        );
      }

      const previousStatus = audience.decision_record_status;
      const previousVersion = audience.decision_record_version;
      if (previousStatus === AudienceRecordStatus.SEALED) {
        if (!decisionDto.amendment_reason?.trim()) {
          throw new BadRequestException(
            'Une correction après scellement exige un motif d’amendement',
          );
        }
        await this.archiveSealedDecision(
          manager,
          audience,
          decisionDto.amendment_reason,
          actor,
        );
        audience.decision_record_version += 1;
        audience.decision_record_status = AudienceRecordStatus.DRAFT;
        audience.decision_record_hash = null;
        audience.decision_sealed_at = null;
      } else if (previousStatus === AudienceRecordStatus.VALIDATED) {
        audience.decision_record_status = AudienceRecordStatus.DRAFT;
      }

      if (decisionDto.decision !== undefined) {
        audience.decision_text = decisionDto.decision;
      }
      if (decisionDto.outcome !== undefined) {
        audience.decision_outcome = decisionDto.outcome;
        audience.outcome = decisionDto.outcome;
      }
      if (decisionDto.decision_date !== undefined) {
        audience.decision_date = decisionDto.decision_date;
      }
      const notes = decisionDto.decision_notes ?? decisionDto.notes;
      if (notes !== undefined) audience.decision_notes = notes;

      if (decisionDto.document_decision_ids !== undefined) {
        const documents = await manager
          .getRepository(DocumentCustomer)
          .findByIds(decisionDto.document_decision_ids);
        this.assertDocumentsBelongToDossier(
          documents,
          decisionDto.document_decision_ids,
          Number(audience.dossier_id),
        );
        audience.decision_documents = documents;
      }

      const saved = await manager.save(audience);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: 'audience.decision.draft_saved',
        resourceType: 'Audience',
        resourceId: audience.id,
        dossierId: Number(audience.dossier_id),
        beforeState: {
          status: previousStatus,
          version: previousVersion,
        },
        afterState: {
          status: saved.decision_record_status,
          version: saved.decision_record_version,
        },
        justification: decisionDto.amendment_reason ?? null,
      });
      return this.toResponse(saved);
    });
  }

  async validateDecision(
    audienceId: number,
    actor: ResourceActor,
  ): Promise<AddDecisionResponseDto> {
    return this.changeDecisionStatus(
      audienceId,
      actor,
      AudienceRecordStatus.DRAFT,
      AudienceRecordStatus.VALIDATED,
    );
  }

  async sealDecision(
    audienceId: number,
    actor: ResourceActor,
  ): Promise<AddDecisionResponseDto> {
    return this.changeDecisionStatus(
      audienceId,
      actor,
      AudienceRecordStatus.VALIDATED,
      AudienceRecordStatus.SEALED,
    );
  }

  private async changeDecisionStatus(
    audienceId: number,
    actor: ResourceActor,
    expected: AudienceRecordStatus,
    target: AudienceRecordStatus,
  ): Promise<AddDecisionResponseDto> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const audience = await manager.findOne(Audience, {
        where: { id: audienceId },
        relations: ['decision_documents'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!audience) {
        throw new NotFoundException(
          `Audience avec ID ${audienceId} non trouvée`,
        );
      }
      if (audience.decision_record_status !== expected) {
        throw new BadRequestException(
          `La décision doit être ${expected} avant le passage à ${target}`,
        );
      }
      if (!audience.decision_text?.trim() || !audience.decision_date) {
        throw new BadRequestException(
          'Le texte et la date de la décision sont obligatoires',
        );
      }

      audience.decision_record_status = target;
      if (target === AudienceRecordStatus.SEALED) {
        audience.decision_record_hash = this.hashDecision(audience);
        audience.decision_sealed_at = new Date();
      }
      const saved = await manager.save(audience);

      if (target === AudienceRecordStatus.SEALED) {
        await this.outboxService.enqueue(manager, {
          eventType: 'audience.decision.sealed',
          aggregateType: 'Audience',
          aggregateId: audience.id,
          idempotencyKey:
            `audience-decision-sealed:${audience.id}:` +
            `${audience.decision_record_version}:${audience.decision_record_hash}`,
          payload: {
            audienceId: audience.id,
            dossierId: Number(audience.dossier_id),
            procedureInstanceId: audience.procedure_instance_id ?? null,
            decisionVersion: audience.decision_record_version,
            decisionHash: audience.decision_record_hash,
            decisionOutcome: audience.decision_outcome ?? null,
          },
        });
      }
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action:
          target === AudienceRecordStatus.SEALED
            ? 'audience.decision.sealed'
            : 'audience.decision.validated',
        resourceType: 'Audience',
        resourceId: audience.id,
        dossierId: Number(audience.dossier_id),
        afterState: {
          status: target,
          version: audience.decision_record_version,
          hash: audience.decision_record_hash,
        },
      });
      return this.toResponse(saved);
    });
  }

  async getDecision(audienceId: number): Promise<Record<string, any>> {
    const audience = await this.audienceRepository.findOne({
      where: { id: audienceId },
      relations: ['decision_documents'],
    });
    if (!audience) {
      throw new NotFoundException(
        `Audience avec ID ${audienceId} non trouvée`,
      );
    }
    return {
      ...this.toResponse(audience),
      decision_text: audience.decision_text,
      decision_outcome: audience.decision_outcome,
      decision_notes: audience.decision_notes,
      record_status: audience.decision_record_status,
      record_version: audience.decision_record_version,
      record_hash: audience.decision_record_hash,
      sealed_at: audience.decision_sealed_at,
      audience_status: audience.status,
    };
  }

  async removeDecisionDocument(
    audienceId: number,
    documentId: number,
    actor: ResourceActor,
  ): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const audience = await manager.findOne(Audience, {
        where: { id: audienceId },
        relations: ['decision_documents'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!audience) {
        throw new NotFoundException(
          `Audience avec ID ${audienceId} non trouvée`,
        );
      }
      if (audience.decision_record_status !== AudienceRecordStatus.DRAFT) {
        throw new BadRequestException(
          'Les pièces ne sont modifiables que sur une décision en brouillon',
        );
      }
      const before = audience.decision_documents?.map((doc) => doc.id) ?? [];
      audience.decision_documents = (audience.decision_documents ?? []).filter(
        (document) => document.id !== documentId,
      );
      await manager.save(audience);
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: 'audience.decision.document_removed',
        resourceType: 'Audience',
        resourceId: audience.id,
        dossierId: Number(audience.dossier_id),
        beforeState: { documentIds: before },
        afterState: {
          documentIds: audience.decision_documents.map((doc) => doc.id),
        },
      });
    });
  }

  private assertDocumentsBelongToDossier(
    documents: DocumentCustomer[],
    requestedIds: number[],
    dossierId: number,
  ): void {
    const foundIds = new Set(documents.map((document) => Number(document.id)));
    const missingIds = requestedIds.filter((id) => !foundIds.has(Number(id)));
    if (missingIds.length) {
      throw new NotFoundException(
        `Documents introuvables: ${missingIds.join(', ')}`,
      );
    }
    const foreignIds = documents
      .filter((document) => Number(document.dossier_id) !== dossierId)
      .map((document) => document.id);
    if (foreignIds.length) {
      throw new BadRequestException(
        `Les documents ${foreignIds.join(', ')} n'appartiennent pas au dossier`,
      );
    }
  }

  private hashDecision(audience: Audience): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          content: audience.decision_text,
          date: audience.decision_date,
          outcome: audience.decision_outcome,
          notes: audience.decision_notes,
          documentIds: (audience.decision_documents ?? [])
            .map((document) => document.id)
            .sort((left, right) => left - right),
          version: audience.decision_record_version,
        }),
      )
      .digest('hex');
  }

  private async archiveSealedDecision(
    manager: EntityManager,
    audience: Audience,
    amendmentReason: string,
    actor: ResourceActor,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO audience_record_revisions
         (tenant_id, audience_id, record_type, version, record_status,
          content, content_hash, amendment_reason, amended_by, created_at)
       VALUES (?, ?, 'DECISION', ?, 'SEALED', ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        getCurrentTenantId(),
        audience.id,
        audience.decision_record_version,
        JSON.stringify({
          content: audience.decision_text,
          date: audience.decision_date,
          outcome: audience.decision_outcome,
          notes: audience.decision_notes,
          documentIds: (audience.decision_documents ?? [])
            .map((document) => document.id)
            .sort((left, right) => left - right),
        }),
        audience.decision_record_hash,
        amendmentReason,
        String(actor.userId ?? actor.id),
      ],
    );
  }

  private toResponse(audience: Audience): AddDecisionResponseDto {
    return {
      id: audience.id,
      decision: audience.decision_text,
      outcome: audience.decision_outcome,
      decision_date: audience.decision_date,
      record_status: audience.decision_record_status,
      record_version: audience.decision_record_version,
      record_hash: audience.decision_record_hash,
      sealed_at: audience.decision_sealed_at,
      documents: (audience.decision_documents ?? []).map((document) => ({
        id: document.id,
        name: document.name,
        current_version_id: document.currentVersionId ?? null,
      })),
    };
  }
}
