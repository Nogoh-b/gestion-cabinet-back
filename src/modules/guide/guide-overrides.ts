import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { PlanModule } from 'src/modules/plans/plan-quota.service';

/**
 * Surcharges de la prise en main (table `guide_overrides`), partagées entre la
 * console plateforme et l'API des cabinets. Fichier sans dépendance Nest
 * injectable, comme `cabinet-sidebar.setting.ts`.
 */
export const GUIDE_KINDS = ['tour', 'step', 'tip', 'help', 'release'] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

/** `page:dossier`, `page:dossier#step:quick-actions`, `tip:ai-dossier`, `help:clients`, `release:2026-11-15`. */
export const GUIDE_TARGET_PATTERN = /^[a-z0-9][a-z0-9:_\-#./]{0,159}$/i;

export const GUIDE_PROFILES = ['avocat', 'secretariat', 'comptable', 'admin'] as const;
export const GUIDE_PLAN_FLAGS: PlanModule[] = ['ai', 'invoicing', 'payroll', 'expenses', 'reporting'];

/** Qui voit une visite, une bulle, une astuce, une fiche d'aide ou une nouveauté. */
export interface GuideAudience {
  permissions?: string[];
  /** true : au moins une des permissions ; sinon toutes. */
  anyPermission?: boolean;
  profiles?: string[];
  planFlags?: string[];
}

export interface GuideViewer {
  permissions: string[];
  /** Administrateur du cabinet ou SUPER_ADMIN : toutes les permissions. */
  isAdmin: boolean;
  profile: string | null;
  /** Modules du forfait ; null = aucun forfait (on n'empêche rien). */
  plan: Partial<Record<string, boolean>> | null;
}

export interface GuideOverrideRow {
  kind: GuideKind;
  target: string;
  data: Record<string, any>;
}

const MAX_DATA_BYTES = 200_000;

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item) : [];
}

/** Même ordre que `isSidebarEntryVisible` : forfait d'abord, puis l'administrateur voit tout. */
export function matchesAudience(audience: GuideAudience | null | undefined, viewer: GuideViewer): boolean {
  if (!audience || typeof audience !== 'object') return true;

  const flags = list(audience.planFlags);
  if (viewer.plan && flags.some((flag) => viewer.plan?.[flag] === false)) return false;

  // Le métier oriente le contenu : il s'applique aussi à l'administrateur.
  const profiles = list(audience.profiles);
  if (profiles.length && (!viewer.profile || !profiles.includes(viewer.profile))) return false;

  const permissions = list(audience.permissions);
  if (!permissions.length || viewer.isAdmin) return true;
  return audience.anyPermission
    ? permissions.some((code) => viewer.permissions.includes(code))
    : permissions.every((code) => viewer.permissions.includes(code));
}

/**
 * Ce qu'un utilisateur reçoit : un contenu réservé devient `{ hidden: true }`
 * (son texte ne quitte pas le serveur), les nouveautés perdent les éléments
 * qu'il ne doit pas voir. L'audience elle-même n'est pas renvoyée.
 */
export function filterForViewer(rows: GuideOverrideRow[], viewer: GuideViewer): GuideOverrideRow[] {
  const out: GuideOverrideRow[] = [];
  for (const row of rows) {
    const { audience, ...data } = row.data ?? {};
    if (row.kind === 'release') {
      const items = (Array.isArray(data.items) ? data.items : [])
        .filter((item: any) => item && matchesAudience(item.audience, viewer))
        .map(({ audience: _audience, ...item }: any) => item);
      if (items.length) out.push({ kind: row.kind, target: row.target, data: { ...data, items } });
      continue;
    }
    if (!matchesAudience(audience, viewer)) {
      out.push({ kind: row.kind, target: row.target, data: { hidden: true } });
      continue;
    }
    out.push({ kind: row.kind, target: row.target, data });
  }
  return out;
}

/** Objet JSON simple, de taille raisonnable ; `{}` pour un brouillon vide. */
export function sanitizeGuideData(value: unknown): Record<string, any> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Le contenu doit être un objet.');
  }
  const json = JSON.stringify(value, (key, item) => (key === '__proto__' || key === 'constructor' ? undefined : item));
  if (Buffer.byteLength(json, 'utf8') > MAX_DATA_BYTES) {
    throw new BadRequestException('Contenu trop volumineux.');
  }
  return JSON.parse(json);
}

/** Un brouillon sans aucun champ revient au contenu d'origine. */
export function isEmptyGuideData(data: Record<string, any> | null | undefined): boolean {
  if (!data) return true;
  return Object.values(data).every((value) => value === undefined || value === null);
}

export function parseJson(raw: unknown): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Version du contenu publié (sert d'ETag), dans `platform_settings`. */
export async function readGuideVersion(db: DataSource | EntityManager): Promise<string> {
  try {
    const rows: Array<{ value: unknown }> = await db.query(
      'SELECT value FROM platform_settings WHERE `key` = ? LIMIT 1',
      ['guide_version'],
    );
    return String(parseJson(rows[0]?.value)?.version ?? '0');
  } catch {
    return '0';
  }
}

export async function bumpGuideVersion(db: DataSource | EntityManager, adminId: number | null): Promise<string> {
  const version = String(Date.now());
  const value = JSON.stringify({ version });
  await db.query(
    'INSERT INTO platform_settings (`key`, value, updated_by_admin_id) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE value = ?, updated_by_admin_id = ?',
    ['guide_version', value, adminId, value, adminId],
  );
  return version;
}

/**
 * Contenu importé depuis un autre serveur. Le compteur de relance d'une
 * visite reste celui du serveur de destination : le reprendre ferait revoir
 * la visite à ses utilisateurs sans raison.
 */
export function importedGuideData(
  kind: GuideKind,
  incoming: unknown,
  existing: Record<string, any> | null | undefined,
): Record<string, any> {
  const data = sanitizeGuideData(incoming);
  if (kind !== 'tour') return data;
  delete data.replayVersion;
  if (existing?.replayVersion) data.replayVersion = existing.replayVersion;
  return data;
}
