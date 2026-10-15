import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import * as express from 'express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  isPublicUploadPath,
  normalizeUploadPath,
  signUploadUrl,
  uploadsGuard,
  verifyUploadSignature,
} from './uploads-access';
import {
  SignUploadUrlsInterceptor,
  signUploadUrlsDeep,
} from '../shared/interceptors/sign-upload-urls.interceptor';

/**
 * `/uploads` : seuls les logos de cabinet (`uploads/cabinets/`) restent
 * publics ; le reste n'est servi que sur une URL signée non expirée.
 */
jest.setTimeout(60000);

let server: Server;
let base: string;
let root: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-uploads';
  delete process.env.UPLOADS_SIGNING_SECRET;
  delete process.env.UPLOADS_URL_TTL_SECONDS;

  root = mkdtempSync(join(tmpdir(), 'uploads-'));
  mkdirSync(join(root, 'cabinets'));
  mkdirSync(join(root, 'docs', 'cabinet-a', 'DOS-1'), { recursive: true });
  writeFileSync(join(root, 'cabinets', 'logo-25-1.png'), 'LOGO');
  writeFileSync(join(root, 'docs', 'cabinet-a', 'DOS-1', 'Acte privé.pdf'), 'SECRET-PDF');
  writeFileSync(join(root, 'docs', 'chat-image.png'), 'CHAT');

  const app = express();
  // Même montage que main.ts.
  app.use('/uploads', uploadsGuard, express.static(root, { index: false }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

describe('GET /uploads (HTTP réel)', () => {
  it('logo de cabinet : public, sans signature', async () => {
    const res = await fetch(`${base}/uploads/cabinets/logo-25-1.png`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('LOGO');
  });

  it('pièce de dossier sans signature : 401', async () => {
    const res = await fetch(
      `${base}/uploads/docs/cabinet-a/DOS-1/${encodeURIComponent('Acte privé.pdf')}`,
    );

    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('SECRET-PDF');
  });

  it('pièce jointe du chat sans signature : 401', async () => {
    expect((await fetch(`${base}/uploads/docs/chat-image.png`)).status).toBe(401);
  });

  it('URL signée (nom accentué avec espace) : 200', async () => {
    const signed = signUploadUrl(
      `${base}/uploads/docs/cabinet-a/DOS-1/Acte privé.pdf`,
    );

    const res = await fetch(signed);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('SECRET-PDF');
  });

  it('signature d’un autre fichier : 401', async () => {
    const signedChat = signUploadUrl(`${base}/uploads/docs/chat-image.png`);
    const query = signedChat.slice(signedChat.indexOf('?'));

    const res = await fetch(
      `${base}/uploads/docs/cabinet-a/DOS-1/${encodeURIComponent('Acte privé.pdf')}${query}`,
    );

    expect(res.status).toBe(401);
  });

  it('URL expirée : 401', async () => {
    const path = 'docs/chat-image.png';
    const expired = signUploadUrl(
      `${base}/uploads/${path}`,
      Date.now() - 24 * 3600 * 1000,
    );

    expect((await fetch(expired)).status).toBe(401);
  });

  it('signature falsifiée ou date repoussée : 401', async () => {
    const signed = new URL(signUploadUrl(`${base}/uploads/docs/chat-image.png`));
    const later = new URL(signed);
    later.searchParams.set('exp', String(Number(signed.searchParams.get('exp')) + 99999));
    const forged = new URL(signed);
    forged.searchParams.set('sig', 'a'.repeat(64));

    expect((await fetch(later)).status).toBe(401);
    expect((await fetch(forged)).status).toBe(401);
  });

  it('traversée de chemin depuis le dossier public : refusée', async () => {
    const dotdot = await fetch(`${base}/uploads/cabinets/%2e%2e/docs/chat-image.png`);
    const raw = await new Promise<number>((resolve) => {
      require('http').get(
        `${base}/uploads/cabinets/../docs/chat-image.png`,
        { agent: false },
        (r: any) => resolve(r.statusCode),
      );
    });

    expect(dotdot.status).not.toBe(200);
    expect(raw).not.toBe(200);
  });

  it('un préfixe voisin de « cabinets » n’est pas public', async () => {
    writeFileSync(join(root, 'cabinets-private.txt'), 'X');

    const res = await fetch(`${base}/uploads/cabinets-private.txt`);

    expect(res.status).toBe(401);
  });
});

describe('uploads-access (unités)', () => {
  it('isPublicUploadPath : uniquement cabinets/', () => {
    expect(isPublicUploadPath('cabinets/logo.png')).toBe(true);
    expect(isPublicUploadPath('docs/cabinets/logo.png')).toBe(false);
    expect(isPublicUploadPath('exports/dossier.zip')).toBe(false);
  });

  it('normalizeUploadPath rejette les chemins suspects', () => {
    expect(normalizeUploadPath('/docs/a/b.pdf')).toBe('docs/a/b.pdf');
    expect(normalizeUploadPath('/docs/../x')).toBeNull();
    expect(normalizeUploadPath('/docs\\x')).toBeNull();
    expect(normalizeUploadPath('/%E0%A4%A')).toBeNull();
    expect(normalizeUploadPath('/')).toBeNull();
  });

  it('signUploadUrl laisse intactes les URLs publiques, étrangères ou déjà signées', () => {
    const logo = 'http://localhost:3005/uploads/cabinets/logo-1.png';
    const other = 'https://exemple.com/images/a.png';
    const signed = signUploadUrl('http://localhost:3005/uploads/docs/a.pdf');

    expect(signUploadUrl(logo)).toBe(logo);
    expect(signUploadUrl(other)).toBe(other);
    expect(signUploadUrl(signed)).toBe(signed);
    expect(signUploadUrl('/uploads/docs/a.pdf')).toMatch(
      /^\/uploads\/docs\/a\.pdf\?exp=\d+&sig=[0-9a-f]{64}$/,
    );
  });

  it('verifyUploadSignature refuse une valeur absente', () => {
    expect(verifyUploadSignature('docs/a.pdf', undefined, undefined)).toBe(false);
    expect(verifyUploadSignature('docs/a.pdf', 'x', 'y')).toBe(false);
  });
});

describe('SignUploadUrlsInterceptor', () => {
  const doc = 'http://localhost:3005/uploads/docs/ff/DOS-1/a.pdf';
  const logo = 'http://localhost:3005/uploads/cabinets/logo-1.png';

  it('signe les URLs privées partout dans la réponse, pas les logos', () => {
    const body = {
      logo_url: logo,
      name: 'Contrat',
      data: [{ file_url: doc, thumbnailUrl: `${doc}.thumb`, nested: { fileUrl: doc } }],
      file_path: 'E:\\app\\uploads\\docs\\ff\\a.pdf',
    };

    const out: any = signUploadUrlsDeep(body);

    expect(out.logo_url).toBe(logo);
    expect(out.file_path).toBe('E:\\app\\uploads\\docs\\ff\\a.pdf');
    expect(out.data[0].file_url).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
    expect(out.data[0].thumbnailUrl).toMatch(/\.thumb\?exp=/);
    expect(out.data[0].nested.fileUrl).toContain('sig=');
  });

  it('préserve dates, buffers, flux et références circulaires', () => {
    const date = new Date();
    const buffer = Buffer.from('x');
    const file = new StreamableFile(buffer);
    const cyclic: any = { file_url: doc };
    cyclic.self = cyclic;

    const out: any = signUploadUrlsDeep({ date, buffer, file, cyclic });

    expect(out.date).toBe(date);
    expect(out.buffer).toBe(buffer);
    expect(out.file).toBe(file);
    expect(out.cyclic.file_url).toContain('sig=');
  });

  it('garde le prototype des instances (règles de sérialisation)', () => {
    class Entity {
      file_url = doc;
      get label() {
        return 'x';
      }
    }

    const out = signUploadUrlsDeep(new Entity());

    expect(out).toBeInstanceOf(Entity);
    expect(out.file_url).toContain('sig=');
  });

  it('intercepte les réponses HTTP et ignore les autres contextes', async () => {
    const interceptor = new SignUploadUrlsInterceptor();
    const http = { getType: () => 'http' } as any;
    const ws = { getType: () => 'ws' } as any;

    const signed: any = await lastValueFrom(
      interceptor.intercept(http, { handle: () => of({ file_url: doc }) }) as any,
    );
    const untouched: any = await lastValueFrom(
      interceptor.intercept(ws, { handle: () => of({ file_url: doc }) }) as any,
    );

    expect(signed.file_url).toContain('sig=');
    expect(untouched.file_url).toBe(doc);
  });
});
