import { ForbiddenException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';

jest.mock('archiver', () => {
  const { PassThrough: MockPassThrough } = require('stream');
  class MockZipArchive extends MockPassThrough {
    append() {
      return this;
    }

    file() {
      return this;
    }

    async finalize() {
      this.end();
    }

    abort() {
      this.end();
    }
  }
  return {
    Archiver: MockZipArchive,
    ZipArchive: MockZipArchive,
  };
});

import { DossierExportService } from './dossier-export.service';

describe('DossierExportService - accès et traçabilité', () => {
  const manager = {};
  const dataSource = {
    transaction: jest.fn(async (callback: any) =>
      callback(manager),
    ),
  };
  const resourcePolicy = {
    assertDossierAccess: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-export-1' })),
  };
  let service: DossierExportService;

  const actor = {
    userId: 7,
    tenantId: 2,
    role: 'avocat',
    permissions: ['view_dossiers'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resourcePolicy.assertDossierAccess.mockResolvedValue({});
    service = new DossierExportService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      resourcePolicy as any,
      audit as any,
    );
  });

  it('refuse la totalité du lot si un dossier est inaccessible', async () => {
    resourcePolicy.assertDossierAccess
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new ForbiddenException('Accès dossier refusé'),
      );
    const response = new PassThrough() as any;
    response.setHeader = jest.fn();
    response.status = jest.fn();

    await expect(
      runWithTenantContext(2, () =>
        service.streamZip(response, [10, 11], actor),
      ),
    ).rejects.toThrow('Accès dossier refusé');

    expect(audit.append).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('autorise chaque dossier et audite demande puis achèvement', async () => {
    jest
      .spyOn(service as any, 'addDossier')
      .mockResolvedValue(true);
    const response = new PassThrough() as any;
    response.setHeader = jest.fn();
    response.status = jest.fn();

    await runWithTenantContext(2, () =>
      service.streamZip(
        response,
        [10, 11],
        actor,
        {
          ip: '127.0.0.1',
          userAgent: 'jest',
          requestId: 'req-export-1',
        },
      ),
    );

    expect(
      resourcePolicy.assertDossierAccess,
    ).toHaveBeenCalledTimes(2);
    expect(audit.append).toHaveBeenCalledTimes(4);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'dossier.export.requested',
        dossierId: 10,
        requestId: 'req-export-1',
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/zip',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store, max-age=0',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'same-origin',
    );
  });

  it('refuse les chemins absolus ou traversants', () => {
    expect(
      (service as any).resolveVersionPath(
        '../outside/document.pdf',
      ),
    ).toBeNull();
    expect(
      (service as any).resolveVersionPath(
        'C:\\Windows\\system.ini',
      ),
    ).toBeNull();
  });

  it('limite un export groupé à vingt-cinq dossiers', async () => {
    const response = new PassThrough() as any;
    response.setHeader = jest.fn();
    response.status = jest.fn();
    const ids = Array.from({ length: 26 }, (_, index) => index + 1);

    await expect(
      runWithTenantContext(2, () =>
        service.streamZip(response, ids, actor),
      ),
    ).rejects.toThrow('entre 1 et 25 dossiers');
  });
});
