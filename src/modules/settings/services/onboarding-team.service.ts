import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OnboardingTourEventDto } from '../dto/onboarding-events.dto';

/** Clés de `seen` qui ne sont pas des visites (accueil, liste, nouveautés). */
const NON_TOUR_KEYS = new Set(['welcome', 'checklist', 'news']);

export interface OnboardingMemberDto {
  id: number;
  name: string;
  email: string | null;
  /** L'écran de bienvenue a été vu (Découvrir ou Ne plus proposer). */
  welcome_seen: boolean;
  /** Présentations automatiques désactivées par le membre. */
  disabled: boolean;
  /** Visites vues (identifiants). */
  seen_tours: string[];
  completed: number;
  abandoned: number;
  last_activity_at: string | null;
}

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

/**
 * Journal des visites guidées et suivi de l'équipe par l'administrateur du
 * cabinet. Requêtes SQL explicites, toujours filtrées par `tenant_id`.
 */
@Injectable()
export class OnboardingTeamService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async recordEvent(tenantId: number, userId: number, event: OnboardingTourEventDto): Promise<void> {
    await this.db.query(
      `INSERT INTO onboarding_tour_events (tenant_id, user_id, tour_id, version, outcome, step_reached, steps_total, \`trigger\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        userId,
        event.tour_id,
        event.version,
        event.outcome,
        Math.min(event.step_reached, event.steps_total),
        event.steps_total,
        event.trigger ?? 'auto',
      ],
    );
  }

  /** Comptes du cabinet (hors portail client) avec leur progression. */
  async team(tenantId: number): Promise<OnboardingMemberDto[]> {
    const [members, events] = await Promise.all([
      this.db.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, s.onboarding_tours
           FROM \`user\` u
           LEFT JOIN user_settings s ON s.user_id = u.id
          WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.customer_id IS NULL
          ORDER BY u.first_name, u.last_name`,
        [tenantId],
      ),
      this.db.query(
        `SELECT user_id, SUM(outcome = 'completed') completed, SUM(outcome = 'abandoned') abandoned, MAX(created_at) last_at
           FROM onboarding_tour_events WHERE tenant_id = ? GROUP BY user_id`,
        [tenantId],
      ),
    ]);
    const byUser = new Map<number, any>(events.map((row: any) => [Number(row.user_id), row]));

    return members.map((row: any) => {
      const state = parseJson(row.onboarding_tours);
      const seen: Record<string, string> = state?.seen ?? {};
      const stats = byUser.get(Number(row.id));
      const last = stats?.last_at ? new Date(stats.last_at) : null;
      return {
        id: Number(row.id),
        name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || `#${row.id}`,
        email: row.email ?? null,
        welcome_seen: Boolean(seen.welcome),
        disabled: Boolean(state?.disabled),
        seen_tours: Object.keys(seen).filter((id) => !NON_TOUR_KEYS.has(id)),
        completed: Number(stats?.completed ?? 0),
        abandoned: Number(stats?.abandoned ?? 0),
        last_activity_at: last && !Number.isNaN(last.getTime()) ? last.toISOString() : null,
      };
    });
  }

  /**
   * Visites à revoir : chaque page se présente de nouveau et l'accueil revient.
   * Sans `userIds`, toute l'équipe. Renvoie le nombre de comptes concernés.
   */
  async reset(tenantId: number, userIds?: number[]): Promise<{ reset: number }> {
    const ids = userIds?.length ? userIds.map(Number).filter(Number.isInteger) : null;
    const scope = ids ? ` AND u.id IN (${ids.map(() => '?').join(', ')})` : '';
    // Seuls les comptes du cabinet sont visés, quoi qu'envoie le client.
    const result = await this.db.query(
      `UPDATE user_settings s
         JOIN \`user\` u ON u.id = s.user_id
          SET s.onboarding_tours = JSON_OBJECT('seen', JSON_OBJECT(), 'disabled', false),
              s.updated_at = s.updated_at
        WHERE u.tenant_id = ? AND u.deleted_at IS NULL AND u.customer_id IS NULL${scope}`,
      [tenantId, ...(ids ?? [])],
    );
    return { reset: Number(result?.affectedRows ?? 0) };
  }
}
