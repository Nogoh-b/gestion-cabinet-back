/// <reference types="jest" />
// Document classé puis modifié : même id, version suivante, ancien fichier
// archivé (document_customer_versions) au lieu d'être écrasé ou dupliqué.
import * as fs from 'fs';
import { DocumentCustomerService } from './document-customer.service';

jest.mock('src/core/tenant/tenant.context', () => ({
  getCurrentTenantId: () => 22,
  hasActiveTenant: () => true,
}));

function setup(document: Record<string, any>) {
  const archived: any[] = [];
  const docRepository = {
    findOne: jest.fn(async () => document),
    save: jest.fn(async (value: any) => value),
  };
  const versionRepository = {
    create: (value: any) => value,
    save: jest.fn(async (value: any) => {
      const row = { id: archived.length + 1, created_at: new Date(2026, 9, 21), ...value };
      archived.push(row);
      return row;
    }),
    find: jest.fn(async () => [...archived].reverse()),
    findOne: jest.fn(async ({ where }: any) => archived.find((row) => row.id === where.id && row.document_id === where.document_id) ?? null),
  };
  const service = Object.create(DocumentCustomerService.prototype) as any;
  Object.assign(service, {
    docRepository,
    repository: docRepository,
    versionRepository,
    planQuotaService: { checkStorageLimit: jest.fn(async () => undefined) },
    cabinetService: { findById: jest.fn(async () => ({ name: 'Cabinet Kaby' })) },
    dossierService: { findOne: jest.fn() },
    currentStorageBytes: jest.fn(async () => 0),
    uploadFile: jest.fn(async (file: any, dir: string, name: string) => ({
      filePath: `uploads/docs/${dir}/${name}_v.docx`,
      fileUrl: `http://localhost/uploads/${name}_v.docx`,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileName: name,
    })),
  });
  return { service, archived, docRepository, versionRepository };
}

const contract = () => ({
  id: 41,
  name: 'Contrat de prestation',
  version: 1,
  file_path: 'uploads/docs/cabinet kaby/DOS-2026-0037/Contrats/Contrat de prestation.docx',
  file_url: 'http://localhost/uploads/Contrat de prestation.docx',
  file_size: 12000,
  file_mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  uploaded_by_id: 7,
  dossier: { id: 89, dossier_number: 'DOS-2026-0037' },
  category: { name: 'Contrats' },
  document_type: null,
  metadata: { original_filename: 'Contrat de prestation.docx' },
});

const upload = (name = 'Contrat de prestation.docx') => ({
  buffer: Buffer.from('docx'),
  size: 13000,
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  originalname: name,
});

describe('versions des documents', () => {
  it('nouvelle version : même document, version 2, ancien fichier archivé', async () => {
    const document = contract();
    const { service, archived } = setup(document);

    const saved = await service.addVersion(41, upload(), 12, { source: 'ai_studio', comment: 'Clause de résiliation ajoutée' });

    expect(saved.id).toBe(41);
    expect(document.version).toBe(2);
    expect(document.file_path).toContain('DOS-2026-0037/Contrats/Pièces diverses');
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({
      document_id: 41,
      version: 1,
      file_path: contract().file_path,
      source: 'upload',
      created_by_id: 7,
    });
    expect(document.metadata).toMatchObject({ version_source: 'ai_studio', version_comment: 'Clause de résiliation ajoutée', version_by: 12 });
  });

  it('historique : la courante puis les archivées, la plus récente d’abord', async () => {
    const document = contract();
    const { service } = setup(document);
    await service.addVersion(41, upload(), 12, { source: 'ai_studio' });
    await service.addVersion(41, upload(), 12, { source: 'upload', comment: 'Version signée' });

    const versions = await service.listVersions(41);

    expect(versions.map((v: any) => [v.version, v.current, v.source])).toEqual([
      [3, true, 'upload'],
      [2, false, 'ai_studio'],
      [1, false, 'upload'],
    ]);
    expect(versions[0].comment).toBe('Version signée');
  });

  it('un changement de statut ne crée pas de version', async () => {
    const document = contract();
    const { service, archived } = setup(document);

    await service.update(41, { status: 4 } as any, 12);

    expect(document.version).toBe(1);
    expect(archived).toHaveLength(0);
  });

  it('remplacer le fichier depuis la fiche crée une version', async () => {
    const document = contract();
    const { service, archived } = setup(document);

    await service.update(41, { file: upload() } as any, 12);

    expect(document.version).toBe(2);
    expect(archived).toHaveLength(1);
  });

  it('restaurer une version la rend courante en version suivante', async () => {
    const document = contract();
    const { service, archived } = setup(document);
    await service.addVersion(41, upload(), 12, { source: 'ai_studio' });
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('ancien contrat') as any);

    await service.restoreVersion(41, archived[0].id, 12);

    expect(document.version).toBe(3);
    expect(document.metadata).toMatchObject({ version_source: 'restore', version_comment: 'Restauration de la version 1' });
    expect(archived).toHaveLength(2);
    jest.restoreAllMocks();
  });
});
