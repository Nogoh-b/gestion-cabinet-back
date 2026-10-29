import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job, Queue } from 'bull';
import { resolve } from 'path';
import { Repository } from 'typeorm';

import { AudioTranscriptionService } from 'src/core/ai-database/audio-transcription.service';
import { getCurrentTenantId, TenantContext } from 'src/core/tenant/tenant.context';
import { splitWav } from 'src/modules/chat/services/chat/chat-transcription.service';
import {
  AudienceRecording,
  RecordingTranscriptStatus,
} from './audience-recording.entity';
import { transcodeToWav } from './audio-transcode';

export const AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE = 'audience-recording-transcription';

interface RecordingTranscriptionJob {
  recordingId: number;
  tenantId: number;
}

/** Redis injoignable : la transcription part sans la file. */
const ENQUEUE_TIMEOUT_MS = 3000;

/**
 * Transcription des segments d'audience : webm/opus → WAV 16 kHz mono
 * (ffmpeg-static), découpé en morceaux acceptés par le modèle (`splitWav`),
 * puis `AudioTranscriptionService`. La fin du segment précédent de la même
 * session est transmise (`previous`) pour garder la numérotation des
 * intervenants d'un segment à l'autre. File Bull calquée sur celle du chat.
 */
@Injectable()
export class AudienceRecordingTranscriptionService {
  private readonly logger = new Logger(AudienceRecordingTranscriptionService.name);
  private readonly tenantContext: TenantContext;

  constructor(
    @InjectRepository(AudienceRecording)
    private readonly repo: Repository<AudienceRecording>,
    @InjectQueue(AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE)
    private readonly queue: Queue<RecordingTranscriptionJob>,
    private readonly moduleRef: ModuleRef,
    @Optional() tenantContext?: TenantContext,
  ) {
    this.tenantContext = tenantContext ?? new TenantContext();
  }

  private get transcription(): AudioTranscriptionService | null {
    try {
      return this.moduleRef.get(AudioTranscriptionService, { strict: false });
    } catch {
      return null;
    }
  }

  /** Moteur de transcription configuré sur la plateforme. */
  available(): boolean {
    return !!this.transcription?.engine().available;
  }

  /**
   * Marque les segments « en attente » et les met en file. Sans `force`, un
   * segment déjà transcrit n'est pas repris.
   */
  async schedule(recordings: AudienceRecording[], options: { force?: boolean } = {}): Promise<void> {
    const targets = recordings.filter(
      (recording) =>
        options.force ||
        (recording.transcript_status !== RecordingTranscriptStatus.DONE &&
          recording.transcript_status !== RecordingTranscriptStatus.EMPTY),
    );
    if (!targets.length) return;
    await this.repo.update(
      targets.map((recording) => recording.id),
      { transcript_status: RecordingTranscriptStatus.PENDING },
    );
    targets.forEach((recording) => {
      recording.transcript_status = RecordingTranscriptStatus.PENDING;
    });
    const tenantId = getCurrentTenantId();
    for (const recording of targets) {
      const data = { recordingId: recording.id, tenantId };
      const queued = await Promise.race([
        this.queue
          .add(data, { attempts: 2, backoff: { type: 'fixed', delay: 15_000 }, removeOnComplete: true, removeOnFail: 50 })
          .then(() => true)
          .catch(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ENQUEUE_TIMEOUT_MS)),
      ]);
      if (!queued) {
        this.logger.warn(`File ${AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE} indisponible : transcription du segment ${recording.id} sans la file.`);
        setImmediate(() => void this.process(data).catch(() => undefined));
      }
    }
  }

  /** Transcrit un segment (appelé par la file). */
  async process({ recordingId, tenantId }: RecordingTranscriptionJob): Promise<void> {
    await this.tenantContext.run(tenantId, async () => {
      const recording = await this.repo.findOne({ where: { id: recordingId, tenant_id: tenantId } });
      if (
        !recording ||
        recording.transcript_status === RecordingTranscriptStatus.DONE ||
        recording.transcript_status === RecordingTranscriptStatus.EMPTY
      ) {
        return;
      }
      const transcription = this.transcription;
      if (!transcription) throw new Error('Service de transcription introuvable');

      await this.repo.update(recording.id, { transcript_status: RecordingTranscriptStatus.PROCESSING });
      try {
        const wav = await transcodeToWav(resolve(process.cwd(), recording.file_path));
        const chunks = splitWav(wav);
        const previous = await this.previousTranscript(recording);
        // Un segment qui suit un autre est présenté comme une « partie » de
        // l'enregistrement, pour que le modèle reprenne les intervenants.
        const offset = previous ? recording.segment_index : 0;
        const texts: string[] = [];
        for (let index = 0; index < chunks.length; index += 1) {
          const { text } = await transcription.transcribe(
            {
              buffer: chunks[index],
              mimetype: 'audio/wav',
              originalname: `audience-${recording.audience_id}-${recording.segment_index + 1}-${index + 1}.wav`,
            },
            {
              part: offset + index + 1,
              parts: offset + chunks.length,
              previous: index === 0 ? previous ?? undefined : texts[index - 1],
            },
          );
          texts.push(text.trim());
        }
        const transcript = texts.filter(Boolean).join('\n\n');
        await this.repo.update(recording.id, {
          transcript: transcript || null,
          transcript_status: transcript ? RecordingTranscriptStatus.DONE : RecordingTranscriptStatus.EMPTY,
        });
      } catch (error) {
        this.logger.warn(`Transcription du segment ${recording.id} impossible : ${(error as Error).message}`);
        await this.repo.update(recording.id, { transcript_status: RecordingTranscriptStatus.FAILED });
      }
    });
  }

  /** Transcription du segment qui précède dans la même session, s'il est déjà transcrit. */
  private async previousTranscript(recording: AudienceRecording): Promise<string | null> {
    if (recording.segment_index <= 0) return null;
    const previous = await this.repo.findOne({
      where: {
        tenant_id: recording.tenant_id,
        audience_id: recording.audience_id,
        session_id: recording.session_id,
        segment_index: recording.segment_index - 1,
      },
    });
    const text = previous?.transcript?.trim();
    return text ? text.slice(-600) : null;
  }
}

@Processor(AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE)
export class AudienceRecordingTranscriptionProcessor {
  constructor(private readonly service: AudienceRecordingTranscriptionService) {}

  @Process()
  async handle(job: Job<RecordingTranscriptionJob>): Promise<void> {
    await this.service.process(job.data);
  }
}
