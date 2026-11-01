import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { AntivirusStatus } from '../documents/document-customer/antivirus-status.enum';
import { SupplierEvidenceStorageService } from './supplier-evidence-storage.service';

describe('SupplierEvidenceStorageService', () => {
  let directory: string;
  let previousRoot: string | undefined;

  beforeEach(async () => {
    previousRoot = process.env.PRIVATE_STORAGE_ROOT;
    directory = await fs.mkdtemp(join(tmpdir(), 'supplier-evidence-'));
    process.env.PRIVATE_STORAGE_ROOT = directory;
  });

  afterEach(async () => {
    if (previousRoot === undefined) {
      delete process.env.PRIVATE_STORAGE_ROOT;
    } else {
      process.env.PRIVATE_STORAGE_ROOT = previousRoot;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('stores a scanned PDF under a tenant-private opaque key', async () => {
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        status: AntivirusStatus.CLEAN,
        details: null,
      }),
    };
    const service = new SupplierEvidenceStorageService(scanner as any);
    const buffer = Buffer.from('%PDF-1.7\nprivate evidence');

    const stored = await runWithTenantContext(42, () =>
      service.store(
        {
          buffer,
          mimetype: 'application/pdf',
          originalname: '../facture.pdf',
        } as Express.Multer.File,
        'invoice',
      ),
    );

    expect(stored.storageKey).toMatch(
      /^tenants\/42\/supplier-evidence\/invoice\/.+\.pdf$/,
    );
    expect(stored.originalName).toBe('facture.pdf');
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(service.read(stored.storageKey)).resolves.toEqual(buffer);
  });

  it('rejects a claimed MIME type that differs from the binary signature', async () => {
    const service = new SupplierEvidenceStorageService({
      scan: jest.fn(),
    } as any);

    await expect(
      runWithTenantContext(42, () =>
        service.store(
          {
            buffer: Buffer.from('%PDF-1.7\ncontent'),
            mimetype: 'image/png',
            originalname: 'fake.png',
          } as Express.Multer.File,
          'expense',
        ),
      ),
    ).rejects.toThrow('incompatible');
  });

  it('fails closed when antivirus scanning is unavailable', async () => {
    const service = new SupplierEvidenceStorageService({
      scan: jest.fn().mockResolvedValue({
        status: AntivirusStatus.UNAVAILABLE,
        details: 'offline',
      }),
    } as any);

    await expect(
      runWithTenantContext(42, () =>
        service.store(
          {
            buffer: Buffer.from('%PDF-1.7\ncontent'),
            mimetype: 'application/pdf',
            originalname: 'preuve.pdf',
          } as Express.Multer.File,
          'expense',
        ),
      ),
    ).rejects.toThrow('antivirus');
  });
});
