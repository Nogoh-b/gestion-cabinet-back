import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const num = (value: unknown) => Number(value ?? 0) || 0;

/** Étapes « Premiers pas » : table dont une ligne du cabinet suffit à cocher l'étape. */
const CHECKLIST_TABLES: { id: string; sql: string }[] = [
  { id: 'client', sql: 'SELECT DISTINCT tenant_id FROM customer WHERE deleted_at IS NULL' },
  { id: 'dossier', sql: 'SELECT DISTINCT tenant_id FROM dossiers WHERE deleted_at IS NULL' },
  { id: 'audience', sql: 'SELECT DISTINCT tenant_id FROM audiences WHERE deleted_at IS NULL' },
  { id: 'document', sql: 'SELECT DISTINCT tenant_id FROM document_customer WHERE deleted_at IS NULL' },
  { id: 'facture', sql: 'SELECT DISTINCT tenant_id FROM factures WHERE deleted_at IS NULL' },
  { id: 'ai', sql: 'SELECT DISTINCT tenant_id FROM ai_request_log' },
  {
    id: 'team',
    sql: 'SELECT tenant_id FROM `user` WHERE deleted_at IS NULL AND customer_id IS NULL GROUP BY tenant_id HAVING COUNT(*) > 1',
  },
];

/**
 * Prise en main vue de la plateforme : réussite de chaque visite guidée, étape
 * où l'on abandonne, et avancement des cabinets (accueil vu, Premiers pas).
 */
@Injectable()
export class PlatformOnboardingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async overview(daysRaw?: string) {
    const days = Math.min(Math.max(Number(daysRaw) || 90, 1), 730);
    const since = `created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`;

    const [tours, abandons, cabinets, members, events, ...checklist] = await Promise.all([
      this.db.query(
        `SELECT tour_id, COUNT(*) plays, SUM(outcome = 'completed') completed, SUM(outcome = 'abandoned') abandoned,
                SUM(\`trigger\` = 'replay') replays, COUNT(DISTINCT tenant_id, user_id) users
           FROM onboarding_tour_events WHERE ${since} GROUP BY tour_id ORDER BY plays DESC`,
      ),
      this.db.query(
        `SELECT tour_id, step_reached, COUNT(*) count
           FROM onboarding_tour_events WHERE ${since} AND outcome = 'abandoned'
          GROUP BY tour_id, step_reached`,
      ),
      this.db.query('SELECT id, name, status FROM cabinets ORDER BY name'),
      this.db.query(
        `SELECT u.tenant_id, COUNT(*) staff,
                SUM(JSON_EXTRACT(s.onboarding_tours, '$.seen.welcome') IS NOT NULL) welcome_seen
           FROM \`user\` u LEFT JOIN user_settings s ON s.user_id = u.id
          WHERE u.deleted_at IS NULL AND u.customer_id IS NULL
          GROUP BY u.tenant_id`,
      ),
      this.db.query(
        `SELECT tenant_id, SUM(outcome = 'completed') completed, SUM(outcome = 'abandoned') abandoned, MAX(created_at) last_at
           FROM onboarding_tour_events WHERE ${since} GROUP BY tenant_id`,
      ),
      ...CHECKLIST_TABLES.map((step) => this.db.query(step.sql)),
    ]);

    const stepsByTour = new Map<string, { step: number; count: number }[]>();
    for (const row of abandons) {
      const list = stepsByTour.get(row.tour_id) ?? [];
      list.push({ step: num(row.step_reached), count: num(row.count) });
      stepsByTour.set(row.tour_id, list);
    }

    const memberStats = new Map<number, any>(members.map((row: any) => [num(row.tenant_id), row]));
    const eventStats = new Map<number, any>(events.map((row: any) => [num(row.tenant_id), row]));
    const done = CHECKLIST_TABLES.map((step, index) => ({
      id: step.id,
      tenants: new Set<number>((checklist[index] as any[]).map((row) => num(row.tenant_id))),
    }));

    return {
      days,
      checklist_steps: CHECKLIST_TABLES.map((step) => step.id),
      tours: tours.map((row: any) => {
        const plays = num(row.plays);
        return {
          tour_id: row.tour_id,
          plays,
          users: num(row.users),
          completed: num(row.completed),
          abandoned: num(row.abandoned),
          replays: num(row.replays),
          completion_rate: plays ? Math.round((num(row.completed) / plays) * 100) : 0,
          abandon_steps: (stepsByTour.get(row.tour_id) ?? []).sort((a, b) => a.step - b.step),
        };
      }),
      cabinets: cabinets.map((row: any) => {
        const id = num(row.id);
        const memberRow = memberStats.get(id);
        const eventRow = eventStats.get(id);
        const last = eventRow?.last_at ? new Date(eventRow.last_at) : null;
        return {
          id,
          name: row.name,
          status: row.status ?? null,
          staff: num(memberRow?.staff),
          welcome_seen: num(memberRow?.welcome_seen),
          completed: num(eventRow?.completed),
          abandoned: num(eventRow?.abandoned),
          last_activity_at: last && !Number.isNaN(last.getTime()) ? last.toISOString() : null,
          checklist_done: done.filter((step) => step.tenants.has(id)).map((step) => step.id),
        };
      }),
    };
  }
}
