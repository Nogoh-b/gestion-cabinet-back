import { decryptSmtpConfig, encryptSmtpConfig } from
  'src/core/shared/emails/smtp-config.crypto';

import { AppSettingsService } from './app-settings.service';

describe('AppSettingsService SMTP security', () => {
  const previousKey = process.env.SETTINGS_ENCRYPTION_KEY;
  const repository = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
  };
  const queryBuilder = {
    addSelect: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn(),
  };
  let service: AppSettingsService;

  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'c'.repeat(64);
    jest.clearAllMocks();
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository.save.mockImplementation(async (entity) => entity);
    service = new AppSettingsService(repository as any);
  });

  afterAll(() => {
    if (previousKey === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = previousKey;
    }
  });

  it('conserve le secret existant quand le formulaire ne le renvoie pas', async () => {
    const cabinet: any = {
      id: 8,
      smtp_config: null,
      smtp_config_encrypted: encryptSmtpConfig({
        host: 'old.example.com',
        port: 465,
        secure: true,
        user: 'mailer@example.com',
        pass: 'existing-password',
      }),
    };
    queryBuilder.getOne.mockResolvedValue(cabinet);

    const saved = await service.update(8, {
      smtp_config: {
        host: 'new.example.com',
        port: 587,
        secure: false,
        user: 'mailer@example.com',
      },
    });

    expect(saved.smtp_config).toBeNull();
    expect(
      decryptSmtpConfig<any>(saved.smtp_config_encrypted!),
    ).toMatchObject({
      host: 'new.example.com',
      port: 587,
      pass: 'existing-password',
    });
  });

  it('ne renvoie jamais le mot de passe ni enveloppe chiffree', () => {
    const cabinet: any = {
      id: 8,
      logo: null,
      logo_mime: null,
      logo_file: null,
      smtp_config: null,
      smtp_config_encrypted: encryptSmtpConfig({
        host: 'smtp.example.com',
        port: 465,
        pass: 'existing-password',
      }),
    };

    const response = service.toResponse(cabinet) as any;

    expect(response.smtp_config).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: undefined,
      user: undefined,
      from: undefined,
      has_password: true,
    });
    expect(response.smtp_config.pass).toBeUndefined();
    expect(response.smtp_config_encrypted).toBeUndefined();
  });
});
