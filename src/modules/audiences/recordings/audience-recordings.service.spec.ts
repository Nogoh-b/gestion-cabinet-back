import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';

import { TenantContext } from 'src/core/tenant/tenant.context';
import { UserRole } from 'src/core/enums/user-role.enum';
import {
  resolveAudioRecordingSettings,
  sanitizeAudioRecordingPatch,
} from 'src/modules/platform/settings/audio-recording.setting';
import { AudienceRecording } from './audience-recording.entity';
import {
  AudienceRecordingsService,
  recordingExtension,
  UPLOADS_ROOT,
} from './audience-recordings.service';

// Cabinet fictif : son dossier `uploads/audiences/<TENANT>` est supprimé après les tests.
const TENANT = 990042;
const tenant = new TenantContext();

function recording(overrides: Partial<AudienceRecording> = {}): AudienceRecording {
  return Object.assign(new AudienceRecording(), {
    id: 1,
    tenant_id: TENANT,
    audience_id: 7,
    session_id: 'sess_1',
    segment_index: 0,
    file_path: `uploads/audiences/${TENANT}/7/a.webm`,
    file_size: 1000,
    duration_seconds: 60,
    mime: 'audio/webm',
    transcript: null,
    transcript_status: null,
    created_by: 3,
    created_at: new Date('2026-10-29T08:00:00Z'),
    ...overrides,
  });
}

function setup(options: { settings?: Record<string, unknown>; audience?: object | null; existing?: AudienceRecording | null; rows?: AudienceRecording[] } = {}) {
  const audienceRepo = {
    findOne: jest.fn(async (_o: any) => (options.audience === undefined ? { id: 7 } : options.audience)),
  };
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('platform_settings')) {
      return options.settings ? [{ value: JSON.stringify(options.settings) }] : [];
    }
    return [{ total: '1234' }];
  });
  const repo = {
    manager: { query, getRepository: () => audienceRepo },
    findOne: jest.fn(async (_o: any) => options.existing ?? null),
    find: jest.fn(async (_o: any) => options.rows ?? []),
    create: jest.fn((data: any) => Object.assign(new AudienceRecording(), data)),
    save: jest.fn(async (entity: any) => Object.assign(entity, { id: 99, created_at: new Date() })),
    delete: jest.fn(async (_ids: unknown) => ({ affected: 1 })),
  };
  const planQuota = { checkStorageLimit: jest.fn(async (_t: number, _b: number) => undefined) };
  const transcription = {
    available: jest.fn(() => true),
    schedule: jest.fn(async (_r: unknown, _o?: unknown) => undefined),
  };
  const storageUsage = { registerSource: jest.fn() };
  const service = new AudienceRecordingsService(
    repo as any,
    planQuota as any,
    transcription as any,
    storageUsage as any,
  );
  return { service, repo, audienceRepo, planQuota, transcription, storageUsage, query };
}

describe('réglage plateforme audio', () => {
  it('valeurs par défaut : 300 s, 24 kbit/s, actif, sans transcription auto', () => {
    expect(resolveAudioRecordingSettings(null)).toEqual({
      enabled: true,
      segment_seconds: 300,
      bitrate_kbps: 24,
      auto_transcribe: false,
    });
  });

  it('borne la durée des segments à 60–1800 s', () => {
    expect(sanitizeAudioRecordingPatch({ segment_seconds: '60' })).toEqual({ segment_seconds: 60 });
    expect(() => sanitizeAudioRecordingPatch({ segment_seconds: 59 })).toThrow(RangeError);
    expect(() => sanitizeAudioRecordingPatch({ segment_seconds: 1801 })).toThrow(RangeError);
  });

  it('ignore une valeur hors bornes stockée en base', () => {
    expect(resolveAudioRecordingSettings({ segment_seconds: 5, bitrate_kbps: 32 })).toMatchObject({
      segment_seconds: 300,
      bitrate_kbps: 32,
    });
  });
});

describe('AudienceRecordingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('déclare sa source « audience_recordings » dans le calcul d’espace du cabinet', async () => {
    const { service, storageUsage, query } = setup();
    service.onModuleInit();
    expect(storageUsage.registerSource).toHaveBeenCalledWith('audience_recordings', expect.any(Function));
    const source = (storageUsage.registerSource.mock.calls[0] as any[])[1];
    await expect(source(TENANT)).resolves.toBe(1234);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('audience_recordings'), [TENANT]);
  });

  it('vérifie le quota AVANT l’écriture, pour la taille annoncée', async () => {
    const { service, planQuota } = setup();
    const { dir } = await tenant.run(TENANT, () => service.prepareUpload(7, { id: 3, role: 'admin' }, 5000));
    expect(planQuota.checkStorageLimit).toHaveBeenCalledWith(TENANT, 5000);
    expect(dir).toBe(`audiences/${TENANT}/7`);
  });

  it('refuse le téléversement si le réglage est désactivé', async () => {
    const { service, planQuota } = setup({ settings: { enabled: false } });
    await expect(tenant.run(TENANT, () => service.prepareUpload(7, null, 10))).rejects.toThrow(ForbiddenException);
    expect(planQuota.checkStorageLimit).not.toHaveBeenCalled();
  });

  it('applique la portée de dossier d’un avocat et répond 404 hors portée', async () => {
    const { service, audienceRepo } = setup({ audience: null });
    await expect(
      tenant.run(TENANT, () => service.list(7, { id: 5, role: UserRole.AVOCAT })),
    ).rejects.toThrow(NotFoundException);
    const where = (audienceRepo.findOne.mock.calls[0] as any[])[0].where;
    expect(where).toMatchObject({ id: 7, tenant_id: TENANT, dossier: { lawyer: { id: 5 } } });
  });

  it('enregistre un segment et ne transcrit pas sans auto_transcribe', async () => {
    const { service, repo, transcription } = setup();
    const path = join(UPLOADS_ROOT, `audiences/${TENANT}/7/x.webm`);
    const view = await tenant.run(TENANT, () =>
      service.saveSegment(7, { id: 3 }, { path, size: 900, mimetype: 'audio/webm;codecs=opus' }, {
        session_id: 'abc_1',
        segment_index: '2',
        duration_seconds: '60',
      }),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audience_id: 7,
        session_id: 'abc_1',
        segment_index: 2,
        duration_seconds: 60,
        mime: 'audio/webm',
        file_path: `uploads/audiences/${TENANT}/7/x.webm`,
        created_by: 3,
      }),
    );
    expect(view.url).toBe(`/uploads/audiences/${TENANT}/7/x.webm`);
    expect(transcription.schedule).not.toHaveBeenCalled();
  });

  it('met en file de transcription si auto_transcribe est actif', async () => {
    const { service, transcription } = setup({ settings: { auto_transcribe: true } });
    await tenant.run(TENANT, () =>
      service.saveSegment(7, { id: 3 }, { path: join(UPLOADS_ROOT, 'audiences/x.webm'), size: 10, mimetype: 'audio/webm' }, { session_id: 's1' }),
    );
    expect(transcription.schedule).toHaveBeenCalledTimes(1);
  });

  it('un nouvel essai du même segment ne crée pas de doublon', async () => {
    const existing = recording({ segment_index: 1 });
    const { service, repo } = setup({ existing });
    const tmp = join(UPLOADS_ROOT, `audiences/__spec_${Date.now()}.webm`);
    await fs.mkdir(join(UPLOADS_ROOT, 'audiences'), { recursive: true });
    await fs.writeFile(tmp, 'x');
    const view = await tenant.run(TENANT, () =>
      service.saveSegment(7, null, { path: tmp, size: 1, mimetype: 'audio/webm' }, { session_id: 'sess_1', segment_index: 1 }),
    );
    expect(view.id).toBe(existing.id);
    expect(repo.save).not.toHaveBeenCalled();
    expect(existsSync(tmp)).toBe(false);
  });

  it('refuse un identifiant de session invalide et un format non audio', async () => {
    const { service } = setup();
    const file = { path: join(UPLOADS_ROOT, 'audiences/none.webm'), size: 10, mimetype: 'audio/webm' };
    await expect(
      tenant.run(TENANT, () => service.saveSegment(7, null, file, { session_id: '../x' })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      tenant.run(TENANT, () => service.saveSegment(7, null, { ...file, mimetype: 'text/html' }, { session_id: 'ok' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('« tout supprimer » efface lignes et fichiers et rend l’espace libéré', async () => {
    const rows = [recording({ id: 1, file_size: 100 }), recording({ id: 2, file_size: 250 })];
    const { service, repo } = setup({ rows });
    const result = await tenant.run(TENANT, () => service.removeAll(7, null));
    expect(repo.delete).toHaveBeenCalledWith([1, 2]);
    expect(result).toEqual({ deleted: 2, freed_bytes: 350 });
  });

  it('refuse un chemin de fichier hors de uploads/', () => {
    const { service } = setup();
    expect(() => service.absolutePath({ file_path: '../secret.txt' })).toThrow(NotFoundException);
    expect(service.absolutePath({ file_path: 'uploads/audiences/1/2/a.webm' })).toBe(
      join(UPLOADS_ROOT, 'audiences/1/2/a.webm'),
    );
  });

  it('choisit l’extension côté serveur selon le type', () => {
    expect(recordingExtension('audio/webm;codecs=opus')).toBe('.webm');
    expect(recordingExtension('audio/ogg')).toBe('.ogg');
    expect(recordingExtension('audio/mp4')).toBe('.m4a');
  });
});

afterAll(async () => {
  await fs.rm(join(UPLOADS_ROOT, `audiences/${TENANT}`), { recursive: true, force: true });
});
