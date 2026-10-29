import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { Repository } from 'typeorm';

import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { StorageUsageService } from 'src/modules/plans/storage-usage.service';
import {
  AudioRecordingSettings,
  readAudioRecordingSettings,
} from 'src/modules/platform/settings/audio-recording.setting';
import { DossierScopeUser, dossierRoleScope } from '../../dossiers/dossier-role-scope';
import { Audience } from '../entities/audience.entity';
import {
  AudienceRecording,
  RecordingTranscriptStatus,
} from './audience-recording.entity';
import { AudienceRecordingTranscriptionService } from './audience-recording-transcription.service';

/** Racine des fichiers servis sous `/uploads` (même dossier que `main.ts`). */
export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

/** Un segment de 30 min à 128 kbit/s pèse ≈ 29 Mo : marge confortable. */
export const RECORDING_MAX_BYTES = 50 * 1024 * 1024;

/** Types acceptés : ce que produit `MediaRecorder` selon le navigateur. */
const RECORDING_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)\b/i;

/** Extension serveur selon le type (jamais celle du client). */
export function recordingExtension(mime: string): string {
  const type = (mime || '').toLowerCase();
  if (type.includes('ogg')) return '.ogg';
  if (type.includes('mp4') || type.includes('aac')) return '.m4a';
  if (type.includes('mpeg')) return '.mp3';
  if (type.includes('wav')) return '.wav';
  return '.webm';
}

export function isRecordingMime(mime: string | undefined | null): boolean {
  return RECORDING_MIME.test(mime ?? '');
}

/** Dossier (relatif à `uploads/`) des segments d'une audience. */
export function recordingDir(tenantId: number, audienceId: number): string {
  return `audiences/${tenantId}/${audienceId}`;
}

export interface RecordingUploadInput {
  session_id?: string;
  segment_index?: string | number;
  duration_seconds?: string | number;
}

export interface RecordingFile {
  /** Chemin absolu écrit par multer. */
  path: string;
  size: number;
  mimetype: string;
}

export interface RecordingView {
  id: number;
  audience_id: number;
  session_id: string;
  segment_index: number;
  file_size: number;
  duration_seconds: number | null;
  mime: string;
  /** URL `/uploads/…` signée à la volée par `SignUploadUrlsInterceptor`. */
  url: string;
  transcript: string | null;
  transcript_status: RecordingTranscriptStatus | null;
  created_by: number | null;
  created_at: Date;
}

export interface RecordingConfig extends AudioRecordingSettings {
  /** Moteur de transcription configuré sur la plateforme. */
  transcription_available: boolean;
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

function toInt(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Enregistrements audio segmentés des audiences : un fichier par segment,
 * sous `uploads/audiences/<tenant>/<audience>/`, compté dans l'espace de
 * stockage du cabinet (source `audience_recordings` de StorageUsageService). Mêmes droits
 * que l'audience : tenant + portée de dossier du rôle (un avocat n'accède
 * qu'aux audiences de ses dossiers).
 */
@Injectable()
export class AudienceRecordingsService implements OnModuleInit {
  private readonly logger = new Logger(AudienceRecordingsService.name);

  constructor(
    @InjectRepository(AudienceRecording)
    private readonly repo: Repository<AudienceRecording>,
    private readonly planQuota: PlanQuotaService,
    private readonly transcription: AudienceRecordingTranscriptionService,
    @Optional() private readonly storageUsage?: StorageUsageService,
  ) {}

  onModuleInit(): void {
    this.storageUsage?.registerSource('audience_recordings', (tenantId) =>
      this.sumRecordingBytes(tenantId),
    );
  }

  /** Octets occupés par les enregistrements d'un cabinet. */
  async sumRecordingBytes(tenantId: number): Promise<number> {
    const rows = await this.repo.manager.query(
      'SELECT COALESCE(SUM(file_size), 0) AS total FROM audience_recordings WHERE tenant_id = ? AND deleted_at IS NULL',
      [tenantId],
    );
    return Number(rows?.[0]?.total ?? 0) || 0;
  }

  settings(): Promise<AudioRecordingSettings> {
    return readAudioRecordingSettings(this.repo.manager);
  }

  async getConfig(): Promise<RecordingConfig> {
    return {
      ...(await this.settings()),
      transcription_available: this.transcription.available(),
    };
  }

  /** Audience du cabinet courant, visible par l'appelant (404 sinon). */
  async assertAudience(audienceId: number, user?: DossierScopeUser | null): Promise<Audience> {
    if (!Number.isInteger(audienceId) || audienceId <= 0) {
      throw new NotFoundException(`Audience ${audienceId} introuvable`);
    }
    const scope = dossierRoleScope(user);
    const audience = await this.repo.manager.getRepository(Audience).findOne({
      where: {
        id: audienceId,
        tenant_id: getCurrentTenantId(),
        ...(Object.keys(scope).length ? { dossier: scope } : {}),
      },
    });
    if (!audience) throw new NotFoundException(`Audience ${audienceId} introuvable`);
    return audience;
  }

  /**
   * Contrôles AVANT l'écriture du fichier (appelé par l'intercepteur de
   * téléversement) : réglage actif, audience accessible, quota du cabinet
   * pour `expectedBytes` (taille annoncée de la requête).
   */
  async prepareUpload(
    audienceId: number,
    user: DossierScopeUser | null | undefined,
    expectedBytes: number,
  ): Promise<{ tenantId: number; dir: string }> {
    const settings = await this.settings();
    if (!settings.enabled) {
      throw new ForbiddenException("L'enregistrement audio des audiences est désactivé sur la plateforme.");
    }
    await this.assertAudience(audienceId, user);
    if (expectedBytes > RECORDING_MAX_BYTES) {
      throw new BadRequestException('Segment audio trop volumineux.');
    }
    const tenantId = getCurrentTenantId();
    await this.planQuota.checkStorageLimit(tenantId, Math.max(0, expectedBytes));
    const dir = recordingDir(tenantId, audienceId);
    await fs.mkdir(join(UPLOADS_ROOT, dir), { recursive: true });
    return { tenantId, dir };
  }

  /** Enregistre un segment déjà écrit sur disque par multer. */
  async saveSegment(
    audienceId: number,
    user: DossierScopeUser | null | undefined,
    file: RecordingFile | undefined,
    input: RecordingUploadInput,
  ): Promise<RecordingView> {
    if (!file?.path) throw new BadRequestException('Aucun segment audio reçu.');
    try {
      if (!file.size) throw new BadRequestException('Segment audio vide.');
      if (!isRecordingMime(file.mimetype)) {
        throw new BadRequestException('Format audio non pris en charge.');
      }
      const sessionId = String(input.session_id ?? '').trim();
      if (!SESSION_ID.test(sessionId)) {
        throw new BadRequestException("Identifiant d'enregistrement invalide.");
      }
      await this.assertAudience(audienceId, user);
      const segmentIndex = toInt(input.segment_index, 0) ?? 0;

      // Nouvel essai d'un segment déjà reçu (réseau coupé après l'envoi) :
      // on garde le premier fichier, sans compter deux fois l'espace.
      const existing = await this.repo.findOne({
        where: {
          tenant_id: getCurrentTenantId(),
          audience_id: audienceId,
          session_id: sessionId,
          segment_index: segmentIndex,
        },
      });
      if (existing) {
        await fs.unlink(file.path).catch(() => undefined);
        return this.view(existing);
      }

      const settings = await this.settings();
      const recording = await this.repo.save(
        this.repo.create({
          audience_id: audienceId,
          session_id: sessionId,
          segment_index: segmentIndex,
          file_path: this.relativeUploadPath(file.path),
          file_size: file.size,
          duration_seconds: toInt(input.duration_seconds, null),
          mime: file.mimetype.split(';')[0].trim().toLowerCase(),
          transcript: null,
          transcript_status: null,
          created_by: user?.id ?? null,
        }),
      );
      if (settings.auto_transcribe && this.transcription.available()) {
        await this.transcription.schedule([recording]);
      }
      return this.view(recording);
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  async list(audienceId: number, user?: DossierScopeUser | null): Promise<{
    items: RecordingView[];
    total_bytes: number;
    total_seconds: number;
  }> {
    await this.assertAudience(audienceId, user);
    const rows = await this.repo.find({
      where: { tenant_id: getCurrentTenantId(), audience_id: audienceId },
      order: { created_at: 'ASC', segment_index: 'ASC', id: 'ASC' },
    });
    return {
      items: rows.map((row) => this.view(row)),
      total_bytes: rows.reduce((sum, row) => sum + (Number(row.file_size) || 0), 0),
      total_seconds: rows.reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0),
    };
  }

  async findOne(
    audienceId: number,
    recordingId: number,
    user?: DossierScopeUser | null,
  ): Promise<AudienceRecording> {
    await this.assertAudience(audienceId, user);
    const recording = await this.repo.findOne({
      where: { id: recordingId, audience_id: audienceId, tenant_id: getCurrentTenantId() },
    });
    if (!recording) throw new NotFoundException(`Enregistrement ${recordingId} introuvable`);
    return recording;
  }

  /** Chemin absolu du fichier d'un segment (refuse tout chemin hors `uploads/`). */
  absolutePath(recording: Pick<AudienceRecording, 'file_path'>): string {
    const absolute = resolve(process.cwd(), recording.file_path);
    const rel = relative(UPLOADS_ROOT, absolute);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new NotFoundException('Fichier audio introuvable');
    }
    return absolute;
  }

  async remove(audienceId: number, recordingId: number, user?: DossierScopeUser | null) {
    const recording = await this.findOne(audienceId, recordingId, user);
    await this.deleteRows([recording]);
    return { deleted: 1, freed_bytes: Number(recording.file_size) || 0 };
  }

  async removeAll(audienceId: number, user?: DossierScopeUser | null) {
    await this.assertAudience(audienceId, user);
    const rows = await this.repo.find({
      where: { tenant_id: getCurrentTenantId(), audience_id: audienceId },
    });
    await this.deleteRows(rows);
    return {
      deleted: rows.length,
      freed_bytes: rows.reduce((sum, row) => sum + (Number(row.file_size) || 0), 0),
    };
  }

  /** Met un segment en file de transcription (relance possible après échec). */
  async requestTranscription(
    audienceId: number,
    recordingId: number,
    user?: DossierScopeUser | null,
  ): Promise<RecordingView> {
    const recording = await this.findOne(audienceId, recordingId, user);
    if (!this.transcription.available()) {
      throw new BadRequestException("La transcription audio n'est pas configurée sur la plateforme.");
    }
    if (
      recording.transcript_status === RecordingTranscriptStatus.PENDING ||
      recording.transcript_status === RecordingTranscriptStatus.PROCESSING
    ) {
      return this.view(recording);
    }
    await this.transcription.schedule([recording], { force: true });
    return this.view(recording);
  }

  /**
   * Suppression définitive : lignes puis fichiers (un fichier déjà absent
   * n'empêche pas de libérer l'espace).
   */
  private async deleteRows(rows: AudienceRecording[]): Promise<void> {
    if (!rows.length) return;
    await this.repo.delete(rows.map((row) => row.id));
    for (const row of rows) {
      try {
        await fs.unlink(this.absolutePath(row));
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          this.logger.warn(`Fichier audio ${row.file_path} non supprimé : ${(error as Error).message}`);
        }
      }
    }
  }

  private relativeUploadPath(absolute: string): string {
    return relative(process.cwd(), absolute).split('\\').join('/');
  }

  view(row: AudienceRecording): RecordingView {
    return {
      id: row.id,
      audience_id: row.audience_id,
      session_id: row.session_id,
      segment_index: row.segment_index,
      file_size: Number(row.file_size) || 0,
      duration_seconds: row.duration_seconds ?? null,
      mime: row.mime,
      url: `/${row.file_path.replace(/^\/+/, '')}`,
      transcript: row.transcript ?? null,
      transcript_status: row.transcript_status ?? null,
      created_by: row.created_by ?? null,
      created_at: row.created_at,
    };
  }
}
