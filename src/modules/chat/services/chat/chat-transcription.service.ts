import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job, Queue } from 'bull';
import { promises as fs } from 'fs';
import { Repository } from 'typeorm';

import {
  audioFormat,
  AudioTranscriptionService,
} from 'src/core/ai-database/audio-transcription.service';
import { MainGateway } from 'src/core/shared/services/socket/main.gateway';
import { getCurrentTenantId, TenantContext } from 'src/core/tenant/tenant.context';
import {
  Attachment,
  AttachmentType,
  TranscriptStatus,
} from '../../entities/attachment.entity';

export const CHAT_TRANSCRIPTION_QUEUE = 'chat-transcription';

interface TranscriptionJob {
  attachmentId: number;
  tenantId: number;
}

/** Morceau envoyé au modèle : 4 min de WAV 16 kHz mono ≈ 7,7 Mo. */
const MAX_CHUNK_SECONDS = 240;
/** Un MP3 n'est pas découpé : au-delà, le fournisseur le refuserait. */
const MAX_MP3_BYTES = 20 * 1024 * 1024;
/** Redis injoignable : la transcription part sans la file. */
const ENQUEUE_TIMEOUT_MS = 3000;

interface WavLayout {
  header: { channels: number; sampleRate: number; bitsPerSample: number };
  blockAlign: number;
  byteRate: number;
  data: Buffer;
}

function readWav(buffer: Buffer): WavLayout | null {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let fmt: WavLayout['header'] | null = null;
  let blockAlign = 0;
  let byteRate = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
      byteRate = buffer.readUInt32LE(body + 8);
      blockAlign = buffer.readUInt16LE(body + 12);
    } else if (id === 'data' && fmt) {
      return { header: fmt, blockAlign, byteRate, data: buffer.subarray(body, Math.min(buffer.length, body + size)) };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

function wavFile(layout: WavLayout, data: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(layout.header.channels, 22);
  header.writeUInt32LE(layout.header.sampleRate, 24);
  header.writeUInt32LE(layout.byteRate, 28);
  header.writeUInt16LE(layout.blockAlign, 32);
  header.writeUInt16LE(layout.header.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Découpe un WAV PCM en morceaux d'au plus `maxSeconds`, en coupant si
 * possible dans le passage le plus calme des 10 dernières secondes (PCM 16
 * bits), pour ne pas trancher un mot.
 */
export function splitWav(buffer: Buffer, maxSeconds = MAX_CHUNK_SECONDS): Buffer[] {
  const layout = readWav(buffer);
  if (!layout || !layout.blockAlign || !layout.byteRate) return [buffer];
  const { data, blockAlign, byteRate } = layout;
  const max = Math.floor((maxSeconds * byteRate) / blockAlign) * blockAlign;
  if (data.length <= max) return [buffer];

  const pcm16 = layout.header.bitsPerSample === 16;
  const window = Math.max(blockAlign, Math.floor((byteRate * 0.05) / blockAlign) * blockAlign);
  const chunks: Buffer[] = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(start + max, data.length);
    if (end < data.length && pcm16) {
      let best = end;
      let quietest = Infinity;
      for (let cursor = Math.max(start + blockAlign, end - byteRate * 10); cursor + window <= end; cursor += window) {
        let energy = 0;
        for (let i = cursor; i + 1 < cursor + window; i += 2) {
          const sample = data.readInt16LE(i);
          energy += sample * sample;
        }
        if (energy < quietest) {
          quietest = energy;
          best = cursor + Math.floor(window / 2 / blockAlign) * blockAlign;
        }
      }
      end = best;
    }
    chunks.push(wavFile(layout, data.subarray(start, end)));
    start = end;
  }
  return chunks;
}

/**
 * Transcription des vocaux du chat : chaque pièce audio (WAV ou MP3) est
 * transcrite après son téléversement par le modèle audio de la plateforme
 * (celui de l'assistant IA), dans la file Bull `chat-transcription`. Le texte
 * est poussé aux participants par `chat:attachment_updated`.
 */
@Injectable()
export class ChatTranscriptionService {
  private readonly logger = new Logger(ChatTranscriptionService.name);
  private readonly tenantContext: TenantContext;

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    @InjectQueue(CHAT_TRANSCRIPTION_QUEUE) private readonly queue: Queue<TranscriptionJob>,
    private readonly moduleRef: ModuleRef,
    @Optional() tenantContext?: TenantContext,
  ) {
    this.tenantContext = tenantContext ?? new TenantContext();
  }

  /** Résolus à la demande (dépendances circulaires avec le chat). */
  private get transcription(): AudioTranscriptionService | null {
    try {
      return this.moduleRef.get(AudioTranscriptionService, { strict: false });
    } catch {
      return null;
    }
  }

  private get gateway(): MainGateway | null {
    try {
      return this.moduleRef.get(MainGateway, { strict: false });
    } catch {
      return null;
    }
  }

  /** Pièce que l'on sait transcrire (audio WAV ou MP3, moteur configuré). */
  canTranscribe(attachment: Pick<Attachment, 'fileType' | 'mimeType' | 'fileName'>): boolean {
    const audio = attachment.fileType === AttachmentType.AUDIO || (attachment.mimeType ?? '').startsWith('audio/');
    return audio && !!audioFormat(attachment.mimeType, attachment.fileName) && !!this.transcription?.engine().available;
  }

  /** Marque les pièces audio « en attente » et les met en file. */
  async schedule(attachments: Attachment[]): Promise<void> {
    const targets = attachments.filter((attachment) => this.canTranscribe(attachment));
    if (!targets.length) return;
    await this.attachmentRepository.update(
      targets.map((attachment) => attachment.id),
      { transcriptStatus: TranscriptStatus.PENDING },
    );
    targets.forEach((attachment) => { attachment.transcriptStatus = TranscriptStatus.PENDING; });
    const tenantId = getCurrentTenantId();
    for (const attachment of targets) {
      const data = { attachmentId: attachment.id, tenantId };
      const queued = await Promise.race([
        this.queue
          .add(data, { attempts: 2, backoff: { type: 'fixed', delay: 15_000 }, removeOnComplete: true, removeOnFail: 50 })
          .then(() => true)
          .catch(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ENQUEUE_TIMEOUT_MS)),
      ]);
      if (!queued) {
        this.logger.warn(`File ${CHAT_TRANSCRIPTION_QUEUE} indisponible : transcription de la pièce ${attachment.id} sans la file.`);
        setImmediate(() => void this.process(data).catch(() => undefined));
      }
    }
  }

  /** Transcrit une pièce et prévient les participants (appelé par la file). */
  async process({ attachmentId, tenantId }: TranscriptionJob): Promise<void> {
    await this.tenantContext.run(tenantId, async () => {
      const attachment = await this.attachmentRepository.findOne({ where: { id: attachmentId } });
      if (!attachment || attachment.transcriptStatus === TranscriptStatus.DONE || attachment.transcriptStatus === TranscriptStatus.EMPTY) {
        return;
      }
      const transcription = this.transcription;
      if (!transcription) throw new Error('Service de transcription introuvable');

      await this.save(attachment, { transcriptStatus: TranscriptStatus.PROCESSING });
      try {
        const buffer = await fs.readFile(attachment.filePath);
        const format = audioFormat(attachment.mimeType, attachment.fileName);
        if (format === 'mp3' && buffer.length > MAX_MP3_BYTES) {
          throw new Error('MP3 trop long pour être transcrit');
        }
        const chunks = format === 'wav' ? splitWav(buffer) : [buffer];
        const texts: string[] = [];
        for (let index = 0; index < chunks.length; index += 1) {
          const { text } = await transcription.transcribe(
            {
              buffer: chunks[index],
              mimetype: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
              originalname: `vocal-${attachment.id}-${index + 1}.${format}`,
            },
            { part: index + 1, parts: chunks.length, previous: texts[index - 1] },
          );
          texts.push(text.trim());
        }
        const transcript = texts.filter(Boolean).join('\n\n');
        await this.save(attachment, {
          transcript: transcript || null,
          transcriptStatus: transcript ? TranscriptStatus.DONE : TranscriptStatus.EMPTY,
        });
      } catch (error) {
        this.logger.warn(`Transcription de la pièce ${attachment.id} impossible : ${(error as Error).message}`);
        await this.save(attachment, { transcriptStatus: TranscriptStatus.FAILED });
      }
    });
  }

  /**
   * Enregistre puis diffuse. Le lien au message est relu après
   * l'enregistrement : une pièce encore libre recevra son texte avec le
   * message, une pièce déjà envoyée par l'événement.
   */
  private async save(
    attachment: Attachment,
    changes: Partial<Pick<Attachment, 'transcript' | 'transcriptStatus'>>,
  ): Promise<void> {
    await this.attachmentRepository.update(attachment.id, changes);
    Object.assign(attachment, changes);
    const linked = await this.attachmentRepository.findOne({
      where: { id: attachment.id },
      relations: ['message'],
    });
    const message = linked?.message;
    if (!message?.conversationId) return;
    await this.gateway
      ?.emitAttachmentUpdated(message.conversationId, message.id, {
        id: attachment.id,
        transcript: attachment.transcript ?? null,
        transcriptStatus: attachment.transcriptStatus ?? null,
      })
      .catch((error) => this.logger.warn(`Diffusion de la transcription ignorée : ${error?.message}`));
  }
}

@Processor(CHAT_TRANSCRIPTION_QUEUE)
export class ChatTranscriptionProcessor {
  constructor(private readonly service: ChatTranscriptionService) {}

  @Process()
  async handle(job: Job<TranscriptionJob>): Promise<void> {
    await this.service.process(job.data);
  }
}
