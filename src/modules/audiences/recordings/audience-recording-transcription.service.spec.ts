import { describe, expect, it, jest } from '@jest/globals';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { AudioTranscriptionService } from 'src/core/ai-database/audio-transcription.service';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  AudienceRecording,
  RecordingTranscriptStatus,
} from './audience-recording.entity';
import { AudienceRecordingTranscriptionService } from './audience-recording-transcription.service';
import { ffmpegPath, fixWavSizes, transcodeToWav } from './audio-transcode';

jest.mock('./audio-transcode', () => {
  const actual = jest.requireActual('./audio-transcode') as Record<string, unknown>;
  return { ...actual, transcodeToWav: jest.fn(actual.transcodeToWav as any) };
});

function wavHeader(dataBytes: number, declared: number): Buffer {
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(0xffffffff, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(declared, 40);
  return buffer;
}

describe('fixWavSizes', () => {
  it('recalcule les tailles laissées vides par ffmpeg sur un tube', () => {
    const fixed = fixWavSizes(wavHeader(100, 0xffffffff));
    expect(fixed.readUInt32LE(40)).toBe(100);
    expect(fixed.readUInt32LE(4)).toBe(fixed.length - 8);
  });
});

const hasFfmpeg = (() => {
  try {
    return spawnSync(ffmpegPath(), ['-version'], { windowsHide: true }).status === 0;
  } catch {
    return false;
  }
})();

(hasFfmpeg ? describe : describe.skip)('transcodeToWav (ffmpeg-static)', () => {
  it('convertit un webm/opus en WAV 16 kHz mono', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    const input = join(dir, 'tone.webm');
    try {
      const made = spawnSync(
        ffmpegPath(),
        ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', '-b:a', '24k', input],
        { windowsHide: true },
      );
      expect(made.status).toBe(0);
      expect(existsSync(input)).toBe(true);
      const real = jest.requireActual('./audio-transcode') as typeof import('./audio-transcode');
      const wav = await real.transcodeToWav(input);
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.readUInt16LE(22)).toBe(1); // mono
      expect(wav.readUInt32LE(24)).toBe(16000);
      // ≈ 2 s × 32 000 octets/s
      expect(wav.length).toBeGreaterThan(60_000);
      expect(wav.length).toBeLessThan(70_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('AudienceRecordingTranscriptionService.process', () => {
  it('transmet la fin du segment précédent de la session (continuité des intervenants)', async () => {
    (transcodeToWav as jest.Mock).mockImplementation(async () => wavHeader(32000, 32000));
    const current = Object.assign(new AudienceRecording(), {
      id: 2,
      tenant_id: 9,
      audience_id: 7,
      session_id: 's',
      segment_index: 1,
      file_path: 'uploads/audiences/9/7/b.webm',
      transcript_status: RecordingTranscriptStatus.PENDING,
    });
    const previous = Object.assign(new AudienceRecording(), {
      id: 1,
      segment_index: 0,
      transcript: 'Intervenant 1 : bonjour. Intervenant 2 : la parole est à la défense.',
    });
    const repo = {
      findOne: jest.fn(async (options: any) => (options.where.id === 2 ? current : previous)),
      update: jest.fn(async (_id: unknown, _changes: unknown) => undefined),
    };
    const transcribe = jest.fn(async (_file: unknown, _options: unknown) => ({ text: ' Intervenant 2 : merci. ', model: 'test' }));
    const moduleRef = {
      get: (token: unknown) => {
        if (token === AudioTranscriptionService) return { transcribe, engine: () => ({ available: true }) };
        throw new Error('absent');
      },
    };
    const service = new AudienceRecordingTranscriptionService(repo as any, {} as any, moduleRef as any, new TenantContext());

    await service.process({ recordingId: 2, tenantId: 9 });

    const options = (transcribe.mock.calls[0] as any[])[1];
    expect(options).toMatchObject({ part: 2, parts: 2 });
    expect(options.previous).toContain('la parole est à la défense');
    expect(repo.update).toHaveBeenLastCalledWith(2, {
      transcript: 'Intervenant 2 : merci.',
      transcript_status: RecordingTranscriptStatus.DONE,
    });
  });
});
