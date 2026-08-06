import { instanceToPlain } from 'class-transformer';
import { DocumentCustomer } from './document-customer.entity';
import { DocumentVersion } from './document-version.entity';

describe('document serialization security', () => {
  const previousAppUrl = process.env.APP_URL;

  beforeAll(() => {
    process.env.APP_URL = 'https://api.example.test';
  });

  afterAll(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  it('n’expose jamais les chemins de stockage ni la valeur de signature', () => {
    const version = Object.assign(new DocumentVersion(), {
      id: 'version-1',
      documentId: 12,
      storageKey: '42/12/private/version-1',
      signatureValue: 'secret-signature-material',
      sha256: 'a'.repeat(64),
    });

    const result = instanceToPlain(version);

    expect(result.storageKey).toBeUndefined();
    expect(result.signatureValue).toBeUndefined();
    expect(result.sha256).toBe('a'.repeat(64));
  });

  it('expose uniquement une route de contenu protégée pour la version courante', () => {
    const document = Object.assign(new DocumentCustomer(), {
      id: 12,
      currentVersionId: 'version-1',
      file_path: 'uploads/docs/confidentiel.pdf',
      file_url: '/uploads/docs/confidentiel.pdf',
    });

    const result = instanceToPlain(document);

    expect(result.file_path).toBeUndefined();
    expect(result.file_url).toBeUndefined();
    expect(result.content_url).toBe(
      'https://api.example.test/documents/12/versions/version-1/content',
    );
  });
});
