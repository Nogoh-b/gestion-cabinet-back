import { spawn } from 'child_process';

/** Échantillonnage attendu par les modèles de transcription (WAV mono). */
export const TRANSCRIPTION_SAMPLE_RATE = 16_000;

/** Un segment de 30 min tient largement : au-delà, ffmpeg est arrêté. */
const TRANSCODE_TIMEOUT_MS = 5 * 60_000;

/** Binaire fourni par `ffmpeg-static` (repli : `ffmpeg` du PATH). */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('ffmpeg-static') as string | null;
    if (path) return path;
  } catch {
    // dépendance absente : ffmpeg du système
  }
  return 'ffmpeg';
}

/**
 * Transcode un fichier audio (webm/opus, ogg, mp4…) en WAV PCM 16 bits,
 * 16 kHz mono, renvoyé en mémoire (≈ 32 Ko par seconde).
 */
export function transcodeToWav(inputPath: string, binary: string = ffmpegPath()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', String(TRANSCRIPTION_SAMPLE_RATE),
        '-c:a', 'pcm_s16le',
        '-f', 'wav',
        'pipe:1',
      ],
      { windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TRANSCODE_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg introuvable ou inutilisable : ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Conversion audio impossible (ffmpeg ${code}) : ${stderr.trim() || 'erreur inconnue'}`));
        return;
      }
      const wav = fixWavSizes(Buffer.concat(chunks));
      if (wav.length <= 44) {
        reject(new Error('Conversion audio vide.'));
        return;
      }
      resolve(wav);
    });
  });
}

/**
 * Sur un tube, ffmpeg ne peut pas revenir écrire les tailles RIFF/data
 * (laissées à 0 ou 0xFFFFFFFF) : on les recalcule pour un en-tête standard
 * de 44 octets, sinon la découpe en morceaux lit un `data` vide.
 */
export function fixWavSizes(buffer: Buffer): Buffer {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') {
      const actual = buffer.length - offset - 8;
      if (size !== actual) buffer.writeUInt32LE(actual, offset + 4);
      buffer.writeUInt32LE(buffer.length - 8, 4);
      return buffer;
    }
    offset += 8 + size + (size % 2);
  }
  return buffer;
}
