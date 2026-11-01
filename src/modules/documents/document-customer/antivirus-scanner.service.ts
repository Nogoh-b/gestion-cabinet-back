import { Injectable } from '@nestjs/common';
import { Socket } from 'net';
import { AntivirusStatus } from './antivirus-status.enum';

export interface AntivirusScanResult {
  status: AntivirusStatus;
  details: string | null;
}

@Injectable()
export class AntivirusScannerService {
  async scan(buffer: Buffer): Promise<AntivirusScanResult> {
    const host = process.env.CLAMAV_HOST;
    if (!host) {
      return {
        status: AntivirusStatus.UNAVAILABLE,
        details: 'CLAMAV_HOST non configuré',
      };
    }
    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 15_000);

    return new Promise((resolve) => {
      const socket = new Socket();
      let response = '';
      let settled = false;
      const finish = (result: AntivirusScanResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeoutMs);
      socket.on('timeout', () =>
        finish({ status: AntivirusStatus.ERROR, details: 'Timeout antivirus' }),
      );
      socket.on('error', (error) =>
        finish({ status: AntivirusStatus.ERROR, details: error.message }),
      );
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => {
        if (response.includes(' FOUND')) {
          finish({ status: AntivirusStatus.INFECTED, details: response.trim() });
        } else if (response.includes(' OK')) {
          finish({ status: AntivirusStatus.CLEAN, details: null });
        } else {
          finish({
            status: AntivirusStatus.ERROR,
            details: response.trim() || 'Réponse antivirus inconnue',
          });
        }
      });
      socket.connect(port, host, () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const chunk = buffer.subarray(offset, offset + chunkSize);
          const size = Buffer.allocUnsafe(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
