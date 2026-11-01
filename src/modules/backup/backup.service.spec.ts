import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BackupService } from './backup.service';

describe('BackupService', () => {
  const previousKey = process.env.BACKUP_ENCRYPTION_KEY;
  const previousMaintenance = process.env.MAINTENANCE_MODE;
  let directory: string;
  let service: BackupService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kaby-backup-test-'));
    process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
    delete process.env.MAINTENANCE_MODE;
    service = new BackupService({ query: jest.fn() } as unknown as DataSource);
    (service as any).dir = directory;
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env.BACKUP_ENCRYPTION_KEY = previousKey;
    process.env.MAINTENANCE_MODE = previousMaintenance;
  });

  it('chiffre, authentifie puis déchiffre sans altération', async () => {
    const source = join(directory, 'source.sql');
    const encrypted = join(directory, 'backup-full-test.sql.enc');
    const restored = join(directory, 'restored.sql');
    const content =
      '-- MySQL dump\nCREATE TABLE evidence(id INT);\nINSERT INTO evidence VALUES (1);';
    writeFileSync(source, content);

    await (service as any).encryptFile(source, encrypted);
    expect(readFileSync(encrypted, 'utf8')).not.toContain('CREATE TABLE');
    await (service as any).decryptFile(encrypted, restored);

    expect(readFileSync(restored, 'utf8')).toBe(content);
  });

  it('refuse une restauration hors fenêtre de maintenance', async () => {
    await expect(
      service.restoreInMaintenance('backup-full-test.sql.enc'),
    ).rejects.toThrow('MAINTENANCE_MODE=true');
  });

  it('détecte toute altération cryptographique', async () => {
    const source = join(directory, 'source.sql');
    const encrypted = join(directory, 'backup-full-test.sql.enc');
    const restored = join(directory, 'restored.sql');
    writeFileSync(source, '-- MySQL dump\nCREATE TABLE evidence(id INT);');
    await (service as any).encryptFile(source, encrypted);
    const bytes = readFileSync(encrypted);
    bytes[bytes.length - 1] ^= 0xff;
    writeFileSync(encrypted, bytes);

    await expect(
      (service as any).decryptFile(encrypted, restored),
    ).rejects.toThrow();
  });
});
