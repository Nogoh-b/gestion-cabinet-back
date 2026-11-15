import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { Permission } from 'src/core/enums/permission.enum';
import {
  GUIDE_PLAN_FLAGS,
  GUIDE_PROFILES,
  GUIDE_TARGET_PATTERN,
  GuideKind,
  bumpGuideVersion,
  isEmptyGuideData,
  parseJson,
  readGuideVersion,
  sanitizeGuideData,
} from 'src/modules/guide/guide-overrides';

export interface GuideRef {
  kind: GuideKind;
  target: string;
}

export interface PlatformGuideRow extends GuideRef {
  id: number;
  data: Record<string, any> | null;
  draft: Record<string, any> | null;
  published_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

function assertRef(ref: GuideRef) {
  if (!GUIDE_TARGET_PATTERN.test(ref.target ?? '')) {
    throw new BadRequestException(`Cible invalide : ${ref.target}`);
  }
}

/**
 * Édition de la prise en main par la plateforme : brouillons, publication,
 * retour au contenu d'origine. Chaque publication change `guide_version`,
 * ce qui invalide le cache des cabinets.
 */
@Injectable()
export class PlatformGuideService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async list(): Promise<{ version: string; items: PlatformGuideRow[] }> {
    const [version, rows] = await Promise.all([
      readGuideVersion(this.db),
      this.db.query(
        `SELECT g.id, g.kind, g.target, g.data, g.draft, g.published_at, g.updated_at,
                pa.full_name AS updated_by
           FROM guide_overrides g
           LEFT JOIN platform_admins pa ON pa.id = g.updated_by_admin_id
          ORDER BY g.kind, g.target`,
      ),
    ]);
    return { version, items: rows.map((row: any) => this.toRow(row)) };
  }

  catalog() {
    return {
      permissions: Object.values(Permission),
      profiles: [...GUIDE_PROFILES],
      planFlags: [...GUIDE_PLAN_FLAGS],
    };
  }

  /** Enregistre un brouillon (rien ne change chez les cabinets avant « Publier »). */
  async saveDraft(ref: GuideRef, draft: unknown, adminId: number) {
    assertRef(ref);
    const value = JSON.stringify(sanitizeGuideData(draft));
    await this.db.query(
      `INSERT INTO guide_overrides (kind, target, draft, updated_by_admin_id) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE draft = ?, updated_by_admin_id = ?`,
      [ref.kind, ref.target, value, adminId, value, adminId],
    );
    const rows = await this.db.query(
      `SELECT g.id, g.kind, g.target, g.data, g.draft, g.published_at, g.updated_at, pa.full_name AS updated_by
         FROM guide_overrides g
         LEFT JOIN platform_admins pa ON pa.id = g.updated_by_admin_id
        WHERE g.kind = ? AND g.target = ?`,
      [ref.kind, ref.target],
    );
    return this.toRow(rows[0]);
  }

  /**
   * Publie les brouillons donnés. `replayTours` : visites à faire revoir aux
   * utilisateurs qui les ont déjà vues (leur version augmente).
   */
  async publish(refs: GuideRef[], replayTours: string[], adminId: number) {
    refs.forEach(assertRef);
    replayTours.forEach((target) => assertRef({ kind: 'tour', target }));
    if (!refs.length && !replayTours.length) throw new BadRequestException('Rien à publier.');

    return this.db.transaction(async (em) => {
      for (const ref of refs) {
        const row = await this.lockRow(em, ref);
        if (!row || row.draft === null) continue;
        const draft = parseJson(row.draft) ?? {};
        if (ref.kind === 'tour') {
          // Le compteur de relance ne passe pas par le brouillon : on le garde.
          const replayVersion = parseJson(row.data)?.replayVersion;
          if (replayVersion) draft.replayVersion = replayVersion;
        }
        if (isEmptyGuideData(draft)) {
          await em.query('DELETE FROM guide_overrides WHERE id = ?', [row.id]);
          continue;
        }
        await em.query(
          'UPDATE guide_overrides SET data = ?, draft = NULL, published_at = NOW(), updated_by_admin_id = ? WHERE id = ?',
          [JSON.stringify(draft), adminId, row.id],
        );
      }

      for (const target of replayTours) {
        const row = await this.lockRow(em, { kind: 'tour', target });
        const data = parseJson(row?.data) ?? {};
        data.replayVersion = Number(data.replayVersion ?? 0) + 1;
        const value = JSON.stringify(data);
        await em.query(
          `INSERT INTO guide_overrides (kind, target, data, published_at, updated_by_admin_id)
           VALUES ('tour', ?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE data = ?, published_at = NOW(), updated_by_admin_id = ?`,
          [target, value, adminId, value, adminId],
        );
      }

      const version = await bumpGuideVersion(em, adminId);
      return { version, published: refs.length, replayed: replayTours };
    });
  }

  /** Abandonne les brouillons ; une ligne jamais publiée disparaît. */
  async discard(refs: GuideRef[]) {
    refs.forEach(assertRef);
    for (const ref of refs) {
      await this.db.query('DELETE FROM guide_overrides WHERE kind = ? AND target = ? AND data IS NULL', [
        ref.kind,
        ref.target,
      ]);
      await this.db.query('UPDATE guide_overrides SET draft = NULL WHERE kind = ? AND target = ?', [
        ref.kind,
        ref.target,
      ]);
    }
    return { discarded: refs.length };
  }

  /** Revient immédiatement au contenu d'origine (ou supprime une création). */
  async remove(ref: GuideRef, adminId: number) {
    assertRef(ref);
    const result: any = await this.db.query('DELETE FROM guide_overrides WHERE kind = ? AND target = ?', [
      ref.kind,
      ref.target,
    ]);
    const affected = Number(result?.affectedRows ?? result?.[1] ?? 0);
    if (!affected) throw new NotFoundException('Aucune modification pour cette cible.');
    const version = await bumpGuideVersion(this.db, adminId);
    return { version };
  }

  private toRow(row: any): PlatformGuideRow {
    return {
      ...row,
      id: Number(row.id),
      data: parseJson(row.data),
      draft: parseJson(row.draft),
      updated_by: row.updated_by ?? null,
    };
  }

  private async lockRow(em: EntityManager, ref: GuideRef): Promise<any | null> {
    const rows = await em.query(
      'SELECT id, data, draft FROM guide_overrides WHERE kind = ? AND target = ? FOR UPDATE',
      [ref.kind, ref.target],
    );
    return rows[0] ?? null;
  }
}
