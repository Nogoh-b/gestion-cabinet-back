import { referenceJson } from '../../reference-data/reference-json';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { PlatformAuditLog } from '../entities/platform-audit-log.entity';

export interface PlatformAuditEntry {
  adminId?: number | null;
  adminEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  cabinetId?: number | null;
  summary?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  outcome?: 'success' | 'failure' | 'denied';
  ip?: string | null;
  userAgent?: string | null;
}

export interface PlatformAuditQuery {
  adminId?: number;
  action?: string;
  cabinetId?: number;
  outcome?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const SENSITIVE_KEYS =
  /pass(word)?|secret|token|api[_-]?key|private|otp|code_hash|webhook_hash/i;

/** Retire récursivement les champs sensibles avant stockage. */
export function redactSensitive(value: any, depth = 0): any {
  if (value === null || value === undefined || depth > 5) return value ?? null;
  if (Array.isArray(value))
    return value.map((v) => redactSensitive(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.test(key)
      ? '[masqué]'
      : redactSensitive(v, depth + 1);
  }
  return out;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(
    @InjectRepository(PlatformAuditLog)
    private readonly repo: Repository<PlatformAuditLog>,
  ) {}

  private compact(value:any,action:string){
    const redacted=redactSensitive(value);
    return action.startsWith('reference.')&&Buffer.byteLength(JSON.stringify(redacted??null))>100000
      ? {reference_snapshot:referenceJson.to(redacted)} : redacted;
  }
  /** Écrit une ligne d'audit. Ne lève jamais (l'audit ne bloque pas l'action). */
  async record(entry: PlatformAuditEntry): Promise<void> {
    try {
      await this.repo.insert({
        admin_id: entry.adminId ?? null,
        admin_email: entry.adminEmail?.slice(0, 150) ?? null,
        action: entry.action.slice(0, 80),
        target_type: entry.targetType?.slice(0, 50) ?? null,
        target_id:
          entry.targetId !== undefined && entry.targetId !== null
            ? String(entry.targetId).slice(0, 64)
            : null,
        cabinet_id: entry.cabinetId ?? null,
        summary: entry.summary?.slice(0, 500) ?? null,
        before: entry.before ? this.compact(entry.before,entry.action) : null,
        after: entry.after ? this.compact(entry.after,entry.action) : null,
        method: entry.method?.slice(0, 10) ?? null,
        path: entry.path?.slice(0, 255) ?? null,
        status_code: entry.statusCode ?? null,
        outcome: entry.outcome ?? 'success',
        ip: entry.ip?.slice(0, 64) ?? null,
        user_agent: entry.userAgent?.slice(0, 255) ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Audit plateforme non enregistré (${entry.action}): ${(error as Error).message}`,
      );
    }
  }

  async list(query: PlatformAuditQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const where: FindOptionsWhere<PlatformAuditLog> = {};
    if (query.adminId) where.admin_id = Number(query.adminId);
    if (query.cabinetId) where.cabinet_id = Number(query.cabinetId);
    if (query.outcome) where.outcome = query.outcome;
    if (query.action) where.action = Like(`${query.action}%`);
    const from = query.from ? new Date(`${query.from}T00:00:00`) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59`) : null;
    if (from && to) where.created_at = Between(from, to);
    else if (from) where.created_at = MoreThanOrEqual(from);
    else if (to) where.created_at = LessThanOrEqual(to);

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: data.map(row=>{
        if(row.action.startsWith('reference.'))for(const field of ['before','after'] as const)if(typeof row[field]?.reference_snapshot==='string')row[field]=referenceJson.from(row[field]!.reference_snapshot);
        return row;
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
