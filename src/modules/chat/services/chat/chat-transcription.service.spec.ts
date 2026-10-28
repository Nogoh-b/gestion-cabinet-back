import { splitWav } from './chat-transcription.service';

/** WAV PCM 16 bits mono de `seconds` secondes (signal constant). */
function wav(seconds: number, sampleRate = 16_000): Buffer {
  const samples = Math.round(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(1000, 44 + i * 2);
  return buffer;
}

describe('splitWav', () => {
  it('laisse entier un vocal court', () => {
    const file = wav(30);
    expect(splitWav(file, 240)).toEqual([file]);
  });

  it('découpe un long vocal en WAV valides, sans perte', () => {
    const file = wav(600);
    const chunks = splitWav(file, 240);
    expect(chunks.length).toBe(3);
    let total = 0;
    for (const chunk of chunks) {
      expect(chunk.toString('ascii', 0, 4)).toBe('RIFF');
      expect(chunk.readUInt32LE(40)).toBe(chunk.length - 44);
      expect((chunk.length - 44) / 32_000).toBeLessThanOrEqual(240);
      total += chunk.length - 44;
    }
    expect(total).toBe(file.length - 44);
  });

  it('rend tel quel un fichier qui n’est pas un WAV', () => {
    const file = Buffer.from('ID3 pas un wav');
    expect(splitWav(file)).toEqual([file]);
  });
});
