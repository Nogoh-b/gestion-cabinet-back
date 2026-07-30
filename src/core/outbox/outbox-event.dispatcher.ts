import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

const SUPPORTED_EVENT_TYPES = new Set([
  'dossier.created',
  'dossier.activated',
  'dossier.closed',
  'dossier.reopened',
  'dossier.archived',
  'dossier.deleted',
  'dossier.member.added',
  'dossier.member.revoked',
  'dossier.members.synchronized',
  'document.version.created',
  'document.version.antivirus_scanned',
  'document.version.accepted',
  'document.version.refused',
  'document.version.revoked',
  'diligence.created',
  'diligence.updated',
  'diligence.started',
  'diligence.review_submitted',
  'diligence.completed',
  'diligence.cancelled',
  'diligence.report_prepared',
  'diligence.documents_attached',
  'diligence.deleted',
  'finding.created',
  'finding.updated',
  'finding.analysis_started',
  'finding.validated',
  'finding.resolved',
  'finding.waived',
  'finding.deleted',
  'procedure.sub-stage.completed',
  'procedure.requirement.approved',
  'procedure.cycle.applied',
  'procedure.sub-stage.started',
  'procedure.task.completed',
  'procedure.transition.applied',
  'procedure.instance.completed',
  'procedure.instance.cancelled',
  'audience.created',
  'audience.updated',
  'audience.rescheduled',
  'audience.reminder.requested',
  'audience.postponed',
  'audience.decision.sealed',
  'audience.report.sealed',
  'audience.held',
  'audience.cancelled',
  'legal_deadline.expiration_due',
  'legal_deadline.warning_due',
  'legal_deadline.completed',
  'legal_deadline.cancelled',
  'payment.created',
  'payment.updated',
  'payment.validated',
  'payment.rejected',
  'payment.cancelled',
  'invoice.issued',
  'invoice.draft_created',
  'invoice.validated',
  'invoice.cancelled',
  'invoice.credit_note.created',
  'invoice.credit_note.validated',
  'invoice.waived',
  'invoice.bad_debt',
  'supplier_invoice.approved',
  'supplier_invoice.paid',
  'expense_report.reimbursed',
  'payslip.paid',
  'salary_advance.paid',
  'referral_commission.paid',
]);

interface DossierMembershipChange {
  userId: number;
  action: 'ADDED' | 'RESTORED' | 'REVOKED';
}

/**
 * Effectue les effets locaux idempotents avant de publier l'événement.
 *
 * L'appelant ne marque l'outbox comme traitée qu'après la résolution de cette
 * méthode. Les consommateurs distants pourront ultérieurement remplacer le
 * bus local sans modifier les producteurs métier.
 */
@Injectable()
export class OutboxEventDispatcher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async dispatch(event: OutboxEvent): Promise<void> {
    if (!SUPPORTED_EVENT_TYPES.has(event.eventType)) {
      throw new Error(
        `Type d'événement outbox sans gestionnaire: ${event.eventType}`,
      );
    }

    let publishedPayload = { ...event.payload };
    if (event.eventType === 'dossier.member.revoked') {
      publishedPayload = {
        ...publishedPayload,
        ...(await this.removeDossierParticipant(
          event.tenant_id,
          Number(event.payload?.dossierId),
          Number(event.payload?.userId),
        )),
      };
    } else if (event.eventType === 'dossier.member.added') {
      publishedPayload = {
        ...publishedPayload,
        ...(await this.addDossierParticipant(
          event.tenant_id,
          Number(event.payload?.dossierId),
          Number(event.payload?.userId),
        )),
      };
    } else if (event.eventType === 'dossier.members.synchronized') {
      publishedPayload = {
        ...publishedPayload,
        ...(await this.synchronizeDossierParticipants(
          event.tenant_id,
          Number(event.payload?.dossierId),
          event.payload?.changes,
        )),
      };
    }

    await this.eventEmitter.emitAsync(`outbox.${event.eventType}`, {
      ...publishedPayload,
      eventId: event.id,
      tenantId: event.tenant_id,
      idempotencyKey: event.idempotencyKey,
      occurredAt: event.created_at?.toISOString?.() ?? null,
    });
  }

  private assertIdentifiers(
    tenantId: number,
    dossierId: number,
    userId?: number,
  ): void {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new Error("L'événement outbox ne contient pas de cabinet valide");
    }
    if (!Number.isInteger(dossierId) || dossierId <= 0) {
      throw new Error("L'événement outbox ne contient pas de dossier valide");
    }
    if (userId !== undefined && (!Number.isInteger(userId) || userId <= 0)) {
      throw new Error("L'événement outbox ne contient pas d'utilisateur valide");
    }
  }

  private async getConversationId(
    tenantId: number,
    dossierId: number,
  ): Promise<number | null> {
    this.assertIdentifiers(tenantId, dossierId);
    const rows = await this.dataSource.query(
      `SELECT conversation_id AS conversationId
       FROM dossier
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [dossierId, tenantId],
    );
    if (!rows.length) {
      throw new Error(`Dossier ${dossierId} introuvable dans le cabinet`);
    }
    const conversationId = Number(rows[0].conversationId);
    return Number.isInteger(conversationId) && conversationId > 0
      ? conversationId
      : null;
  }

  private async removeDossierParticipant(
    tenantId: number,
    dossierId: number,
    userId: number,
  ): Promise<{ conversationId: number | null }> {
    this.assertIdentifiers(tenantId, dossierId, userId);
    const conversationId = await this.getConversationId(tenantId, dossierId);
    if (conversationId == null) return { conversationId };
    await this.dataSource.query(
      `DELETE cp
       FROM conversation_participants_employee cp
       INNER JOIN conversation c ON c.id = cp.conversationId
       INNER JOIN employee e ON e.id = cp.employeeId
       WHERE cp.conversationId = ?
         AND cp.employeeId = ?
         AND c.tenant_id = ?
         AND e.tenant_id = ?`,
      [conversationId, userId, tenantId, tenantId],
    );
    return { conversationId };
  }

  private async addDossierParticipant(
    tenantId: number,
    dossierId: number,
    userId: number,
  ): Promise<{ conversationId: number | null }> {
    this.assertIdentifiers(tenantId, dossierId, userId);
    const conversationId = await this.getConversationId(tenantId, dossierId);
    if (conversationId == null) return { conversationId };
    await this.dataSource.query(
      `INSERT IGNORE INTO conversation_participants_employee
         (conversationId, employeeId)
       SELECT ?, e.id
       FROM employee e
       INNER JOIN conversation c ON c.id = ?
       WHERE e.id = ?
         AND e.tenant_id = ?
         AND c.tenant_id = ?`,
      [conversationId, conversationId, userId, tenantId, tenantId],
    );
    return { conversationId };
  }

  private async synchronizeDossierParticipants(
    tenantId: number,
    dossierId: number,
    rawChanges: unknown,
  ): Promise<{ conversationId: number | null }> {
    this.assertIdentifiers(tenantId, dossierId);
    const changes = Array.isArray(rawChanges)
      ? rawChanges.filter(
          (item): item is DossierMembershipChange =>
            Number.isInteger(Number(item?.userId)) &&
            ['ADDED', 'RESTORED', 'REVOKED'].includes(item?.action),
        )
      : [];
    let conversationId: number | null = null;
    for (const change of changes) {
      const result =
        change.action === 'REVOKED'
          ? await this.removeDossierParticipant(
              tenantId,
              dossierId,
              Number(change.userId),
            )
          : await this.addDossierParticipant(
              tenantId,
              dossierId,
              Number(change.userId),
            );
      conversationId = result.conversationId;
    }
    if (changes.length === 0) {
      conversationId = await this.getConversationId(tenantId, dossierId);
    }
    return { conversationId };
  }
}
