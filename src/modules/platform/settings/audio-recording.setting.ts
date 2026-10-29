import { DataSource, EntityManager } from 'typeorm';

/**
 * Enregistrement audio des audiences, piloté par la plateforme (tous les
 * cabinets). Fichier sans dépendance Nest : lu par le module audiences sans
 * importer le module plateforme (même approche que `cabinet-sidebar.setting.ts`).
 */
export const AUDIO_SEGMENT_SECONDS_MIN = 60;
export const AUDIO_SEGMENT_SECONDS_MAX = 1800;
export const AUDIO_BITRATE_KBPS_MIN = 8;
export const AUDIO_BITRATE_KBPS_MAX = 128;

export const AUDIO_RECORDING_DEFAULTS = {
  enabled: true,
  /** Durée d'un segment : le navigateur coupe et téléverse à chaque fin de segment. */
  segment_seconds: 300,
  /** Débit Opus visé (24 kbit/s ≈ 0,9 Mo par segment de 5 min). */
  bitrate_kbps: 24,
  /** Transcrire chaque segment dès son téléversement. */
  auto_transcribe: false,
};

export type AudioRecordingSettings = typeof AUDIO_RECORDING_DEFAULTS;

function boundedInt(value: unknown, min: number, max: number, label: string): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new RangeError(`${label} : valeur attendue entre ${min} et ${max}.`);
  }
  return n;
}

/**
 * Valide un patch du réglage (`RangeError` si une borne est dépassée) et ne
 * garde que les clés connues.
 */
export function sanitizeAudioRecordingPatch(value: Record<string, any>): Partial<AudioRecordingSettings> {
  const out: Partial<AudioRecordingSettings> = {};
  for (const flag of ['enabled', 'auto_transcribe'] as const) {
    if (value[flag] !== undefined) out[flag] = value[flag] === true;
  }
  if (value.segment_seconds !== undefined) {
    out.segment_seconds = boundedInt(
      value.segment_seconds,
      AUDIO_SEGMENT_SECONDS_MIN,
      AUDIO_SEGMENT_SECONDS_MAX,
      'Durée des segments audio (secondes)',
    );
  }
  if (value.bitrate_kbps !== undefined) {
    out.bitrate_kbps = boundedInt(
      value.bitrate_kbps,
      AUDIO_BITRATE_KBPS_MIN,
      AUDIO_BITRATE_KBPS_MAX,
      'Débit audio (kbit/s)',
    );
  }
  return out;
}

/** Réglage effectif : valeurs par défaut si la ligne est absente ou illisible. */
export function resolveAudioRecordingSettings(raw: unknown): AudioRecordingSettings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const out = { ...AUDIO_RECORDING_DEFAULTS };
  for (const key of Object.keys(AUDIO_RECORDING_DEFAULTS) as Array<keyof AudioRecordingSettings>) {
    if (value[key] === undefined || value[key] === null) continue;
    try {
      Object.assign(out, sanitizeAudioRecordingPatch({ [key]: value[key] }));
    } catch {
      // valeur hors bornes en base : on garde la valeur par défaut
    }
  }
  return out;
}

export async function readAudioRecordingSettings(
  db: DataSource | EntityManager,
): Promise<AudioRecordingSettings> {
  let value: unknown = null;
  try {
    const rows: Array<{ value: any }> = await db.query(
      'SELECT value FROM platform_settings WHERE `key` = ? LIMIT 1',
      ['audio'],
    );
    const raw = rows[0]?.value;
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    value = null;
  }
  return resolveAudioRecordingSettings(value);
}
