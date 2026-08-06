import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { getCurrentTenantId } from '../tenant/tenant.context';
import { AuditEvent } from './audit-event.entity';

export interface AppendAuditEvent {
  actorId?: string | number | null;
  action: string;
  resourceType: string;
  resourceId: string | number;
  dossierId?: number | null;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  justification?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  async append(
    manager: EntityManager,
    input: AppendAuditEvent,
  ): Promise<AuditEvent> {
    const tenantId = getCurrentTenantId();
    await manager.query(
      `INSERT IGNORE INTO audit_chain_heads
       (tenant_id, current_hash, current_event_id, sequence_no, updated_at)
       VALUES (?, NULL, NULL, 0, UTC_TIMESTAMP(6))`,
      [tenantId],
    );
    const [head] = await manager.query(
      `SELECT current_hash
       FROM audit_chain_heads
       WHERE tenant_id = ?
       FOR UPDATE`,
      [tenantId],
    );
    const previousHash = head?.current_hash ?? null;
    const id = randomUUID();
    const occurredAt = new Date();
    const beforeState = this.sanitize(input.beforeState ?? null);
    const afterState = this.sanitize(input.afterState ?? null);
    const canonical = this.stableStringify({
      id,
      tenantId,
      actorId: input.actorId == null ? null : String(input.actorId),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: String(input.resourceId),
      dossierId: input.dossierId ?? null,
      beforeState,
      afterState,
      justification: input.justification ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      occurredAt: occurredAt.toISOString(),
      previousHash,
    });
    const currentHash = createHash('sha256').update(canonical).digest('hex');
    const event = manager.create(AuditEvent, {
      id,
      tenant_id: tenantId,
      actorId: input.actorId == null ? null : String(input.actorId),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: String(input.resourceId),
      dossierId: input.dossierId ?? null,
      beforeState,
      afterState,
      justification: input.justification ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      previousHash,
      currentHash,
      createdAt: occurredAt,
    });
    const saved = await manager.save(event);
    await manager.query(
      `UPDATE audit_chain_heads
       SET current_hash = ?, current_event_id = ?,
           sequence_no = sequence_no + 1, updated_at = UTC_TIMESTAMP(6)
       WHERE tenant_id = ?`,
      [currentHash, id, tenantId],
    );
    return saved;
  }

  private sanitize(
    value: Record<string, any> | null,
  ): Record<string, any> | null {
    if (!value) return null;
    const forbidden =
      /password|secret|token|authorization|cookie|binary|content|credential|smtp|(^|_)(pass|private_key|api_key)($|_)/i;
    const visit = (input: any): any => {
      if (Array.isArray(input)) return input.map(visit);
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input)
            .filter(([key]) => !forbidden.test(key))
            .map(([key, child]) => [key, visit(child)]),
        );
      }
      return input;
    };
    return visit(value);
  }

  private stableStringify(value: any): string {
    const normalize = (input: any): any => {
      if (Array.isArray(input)) return input.map(normalize);
      if (input && typeof input === 'object') {
        return Object.keys(input)
          .sort()
          .reduce<Record<string, any>>((result, key) => {
            result[key] = normalize(input[key]);
            return result;
          }, {});
      }
      return input;
    };
    return JSON.stringify(normalize(value));
  }
}
