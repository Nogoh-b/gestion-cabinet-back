import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, normalize } from 'path';
import { UPLOAD_FOLDER_NAME, UPLOAD_PATH } from 'src/core/common/constants/constants';
import type { Cabinet } from './entities/cabinet.entity';

/**
 * Gestion du logo cabinet en FICHIER STATIQUE (au lieu d'un data-URI base64).
 *
 * Pourquoi : les data-URI (`data:image/...;base64,…`) sont systématiquement
 * bloqués/strippés par les clients e-mail (Gmail, Outlook) → le logo n'apparaît
 * pas dans les mails. En écrivant le logo dans `uploads/cabinets/…` et en
 * exposant une URL HTTP hébergée, l'image se charge normalement partout.
 *
 * Le blob `logo`/`logo_mime` reste stocké en BDD comme source de vérité ; le
 * fichier `logo_file` n'en est qu'une copie servie publiquement.
 */

/** Sous-dossier (sous `uploads/`) où sont écrits les logos cabinet. */
const LOGO_SUBDIR = 'cabinets';

/** Convertit un type MIME image en extension de fichier. */
function mimeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
}

/**
 * Construit l'URL publique absolue d'un logo à partir de son chemin relatif
 * (ex: `cabinets/logo-1-1700000000.png`). Renvoie `null` si aucun fichier.
 * Base = `APP_URL` (.env), ex: `https://api-cabinet.bysoft-corp.com`.
 */
export function logoFileToUrl(relPath?: string | null): string | null {
  if (!relPath) return null;
  const base = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  // chemin relatif normalisé en URL (slashes)
  const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${base}/${UPLOAD_FOLDER_NAME}/${clean}`;
}

/**
 * Écrit le buffer logo dans `uploads/cabinets/logo-{id}-{timestamp}.{ext}`.
 * Renvoie le chemin RELATIF (à stocker en BDD), ex: `cabinets/logo-1-….png`.
 */
export function writeLogoFile(
  cabinetId: number,
  buffer: Buffer,
  mime: string,
): string {
  const dir = join(UPLOAD_PATH, LOGO_SUBDIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filename = `logo-${cabinetId}-${Date.now()}.${mimeToExt(mime)}`;
  writeFileSync(join(dir, filename), buffer);
  // toujours en slashes pour rester utilisable tel quel dans une URL
  return `${LOGO_SUBDIR}/${filename}`;
}

/** Supprime le fichier logo (best-effort, ignore les erreurs). */
export function deleteLogoFile(relPath?: string | null): void {
  if (!relPath) return;
  try {
    const full = normalize(join(UPLOAD_PATH, relPath));
    // garde-fou : ne supprimer que sous UPLOAD_PATH
    if (full.startsWith(normalize(UPLOAD_PATH)) && existsSync(full)) {
      unlinkSync(full);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Applique une valeur `logo_url` (reçue de l'API) sur un cabinet :
 *  - `undefined`      → ne touche à rien (champ absent de la requête)
 *  - `null` / `''`    → efface le logo (blob + fichier)
 *  - data-URI base64  → décode, écrit le fichier, met à jour blob + `logo_file`
 *  - autre (URL http…)→ ignoré (déjà une URL, pas de ré-upload)
 *
 * Le cabinet doit déjà avoir un `id` (entité chargée depuis la BDD).
 */
export function applyLogoInput(
  cabinet: Cabinet,
  logoUrl?: string | null,
): void {
  // Champ absent → aucune modification.
  if (logoUrl === undefined) return;

  // Effacement explicite.
  if (logoUrl === null || logoUrl.trim() === '') {
    deleteLogoFile(cabinet.logo_file);
    cabinet.logo = null;
    cabinet.logo_mime = null;
    cabinet.logo_file = null;
    return;
  }

  const match = /^data:([^;]+);base64,(.+)$/s.exec(logoUrl.trim());
  // Pas un data-URI (probablement déjà une URL hébergée renvoyée telle quelle) → no-op.
  if (!match) return;

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');

  // Remplace l'éventuel ancien fichier.
  deleteLogoFile(cabinet.logo_file);

  cabinet.logo = buffer;
  cabinet.logo_mime = mime;
  cabinet.logo_file = writeLogoFile(cabinet.id, buffer, mime);
}
