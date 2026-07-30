import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { DocumentType } from '../document-type/entities/document-type.entity';
import { DocumentVersionService } from './document-version.service';
import {
  AntivirusStatus,
  DocumentVersion,
  DocumentVersionStatus,
} from './entities/document-version.entity';
import { DocumentCustomer } from './entities/document-customer.entity';

describe('DocumentVersionService - décision immuable', () => {
  const versionRepository = {};
  const documentRepository = {};
  const manager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const scanner = { scan: jest.fn() };
  const audit = { append: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  const quota = { checkStorageLimit: jest.fn() };
  let service: DocumentVersionService;

  const version = () =>
    ({
      id: 'version-1',
      tenant_id: 2,
      documentId: 12,
      versionNumber: 1,
      status: DocumentVersionStatus.PENDING_REVIEW,
      antivirusStatus: AntivirusStatus.CLEAN,
      sha256: 'a'.repeat(64),
      reviewedBy: null,
      reviewedAt: null,
      decisionReason: null,
      signatureValue: null,
      sealedAt: null,
    }) as DocumentVersion;

  const document = () =>
    ({
      id: 12,
      tenant_id: 2,
      dossier_id: 9,
      currentVersionId: 'version-1',
      status: 0,
    }) as DocumentCustomer;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.create.mockImplementation((_target, entity) => entity);
    manager.save.mockImplementation(async (entity) => entity);
    dataSource.transaction.mockImplementation(
      async (_level: string, callback: (tx: typeof manager) => unknown) =>
        callback(manager),
    );
    audit.append.mockResolvedValue({ id: 'audit-1' });
    outbox.enqueue.mockResolvedValue({ id: 'event-1' });
    service = new DocumentVersionService(
      versionRepository as any,
      documentRepository as any,
      dataSource as any,
      scanner as any,
      audit as any,
      outbox as any,
      quota as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dérive le client du dossier et ignore toute valeur injectée par le client API', async () => {
    jest
      .spyOn(fs, 'mkdir')
      .mockResolvedValue(undefined);
    jest
      .spyOn(fs, 'writeFile')
      .mockResolvedValue(undefined);
    (service as any).assertStorageQuota = jest.fn().mockResolvedValue(undefined);
    scanner.scan.mockResolvedValue({
      status: AntivirusStatus.CLEAN,
      details: null,
    });
    manager.findOne
      .mockResolvedValueOnce({
        id: 9,
        tenant_id: 2,
        client_id: 44,
        procedureInstanceId: 'instance-1',
      } as Dossier)
      .mockResolvedValueOnce({
        id: 3,
        tenant_id: 2,
        mimetype: 'application/pdf',
        max_size: 10_000,
      } as unknown as DocumentType);
    manager.save.mockImplementation(async (entity) => {
      if (entity instanceof DocumentCustomer && !entity.id) entity.id = 12;
      return entity;
    });

    const result = await runWithTenantContext(2, () =>
      service.createDocument(
        {
          document_type_id: 3,
          dossier_id: 9,
          name: 'Pièce',
          customer_id: 999,
        } as any,
        {
          buffer: Buffer.from('%PDF-1.4\ncontenu'),
          originalname: 'piece.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File,
        20,
      ),
    );

    expect(result.customer_id).toBe(44);
    expect(result.dossier_id).toBe(9);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'document.version.created',
        dossierId: 9,
      }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'document.version.created',
      }),
    );
  });

  it("refuse une visite d'étape appartenant à une autre instance", async () => {
    manager.findOne.mockResolvedValueOnce({
      id: 'stage-1',
      tenant_id: 2,
      instanceId: 'instance-étrangère',
      documents: [],
    } as unknown as StageVisit);

    await expect(
      runWithTenantContext(2, () =>
        (service as any).linkProcedureVisitsIfRequested(
          manager,
          { procedureInstanceId: 'instance-dossier' } as Dossier,
          document(),
          'stage-1',
          undefined,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it("refuse une sous-étape qui ne dépend pas de l'étape indiquée", async () => {
    const stage = {
      id: 'stage-1',
      tenant_id: 2,
      instanceId: 'instance-dossier',
      documents: [],
    } as unknown as StageVisit;
    manager.findOne
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce({
        id: 'sub-stage-1',
        tenant_id: 2,
        stageVisitId: 'stage-2',
        stageVisit: {
          id: 'stage-2',
          instanceId: 'instance-dossier',
          documents: [],
        },
        documents: [],
      } as unknown as SubStageVisit);

    await expect(
      runWithTenantContext(2, () =>
        (service as any).linkProcedureVisitsIfRequested(
          manager,
          { procedureInstanceId: 'instance-dossier' } as Dossier,
          document(),
          'stage-1',
          'sub-stage-1',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('lie la pièce à la sous-étape et à son étape sans doublon', async () => {
    const currentDocument = document();
    const stage = {
      id: 'stage-1',
      tenant_id: 2,
      instanceId: 'instance-dossier',
      documents: [currentDocument],
    } as StageVisit;
    const subStage = {
      id: 'sub-stage-1',
      tenant_id: 2,
      stageVisitId: stage.id,
      stageVisit: stage,
      documents: [],
    } as unknown as SubStageVisit;
    manager.findOne
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce(subStage);

    await runWithTenantContext(2, () =>
      (service as any).linkProcedureVisitsIfRequested(
        manager,
        { procedureInstanceId: 'instance-dossier' } as Dossier,
        currentDocument,
        stage.id,
        subStage.id,
      ),
    );

    expect(subStage.documents).toEqual([currentDocument]);
    expect(stage.documents).toEqual([currentDocument]);
    expect(manager.save).toHaveBeenCalledWith(subStage);
    expect(manager.save).toHaveBeenCalledWith(stage);
  });

  it('refuse une version sans résultat antivirus CLEAN', async () => {
    manager.findOne.mockResolvedValueOnce({
      ...version(),
      antivirusStatus: AntivirusStatus.UNAVAILABLE,
    });

    await expect(
      runWithTenantContext(2, () =>
        service.validate(12, 'version-1', {}, 20),
      ),
    ).rejects.toThrow(
      "Une version sans résultat antivirus CLEAN ne peut pas être acceptée",
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuse la validation tardive d’une version qui n’est plus courante', async () => {
    manager.findOne
      .mockResolvedValueOnce(version())
      .mockResolvedValueOnce({
        ...document(),
        currentVersionId: 'version-2',
      });

    await expect(
      runWithTenantContext(2, () =>
        service.validate(12, 'version-1', {}, 20),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('scelle la version courante et produit audit et outbox atomiquement', async () => {
    const currentVersion = version();
    const currentDocument = document();
    manager.findOne
      .mockResolvedValueOnce(currentVersion)
      .mockResolvedValueOnce(currentDocument);

    const result = await runWithTenantContext(2, () =>
      service.validate(
        12,
        'version-1',
        { reason: 'Pièce juridiquement vérifiée', signatureValue: 'seal-1' },
        20,
      ),
    );

    expect(result.status).toBe(DocumentVersionStatus.ACCEPTED);
    expect(result.sealedAt).toBeInstanceOf(Date);
    expect(result.signatureValue).toBe('seal-1');
    expect(manager.findOne).toHaveBeenNthCalledWith(
      1,
      DocumentVersion,
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 2 }),
      }),
    );
    expect(manager.findOne).toHaveBeenNthCalledWith(
      2,
      DocumentCustomer,
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 2 }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'document.version.accepted',
        dossierId: 9,
      }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'document.version.accepted',
      }),
    );
  });
});
