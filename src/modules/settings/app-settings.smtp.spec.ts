import { describe, expect, it, jest } from '@jest/globals';
import { AppSettingsController } from './controllers/app-settings.controller';
import { AppSettingsService } from './services/app-settings.service';
import { SMTP_PASSWORD_MASK } from './smtp-config.util';

/**
 * Le mot de passe SMTP du cabinet ne sort jamais en clair, et n'est visible
 * (masqué) que de ceux qui gèrent les paramètres.
 */
const smtp = {
  host: 'smtp.test',
  port: 465,
  secure: true,
  user: 'no-reply@test',
  pass: 'secret-smtp',
  from: 'Cabinet <no-reply@test>',
};

function cabinetRow() {
  return {
    id: 25,
    name: 'Cabinet Test',
    invoice_prefix: 'FAC-',
    smtp_config: { ...smtp },
    ai_config: { provider: 'x' },
  };
}

const ADMIN = { id: 48, role: 'admin', tenantId: 25, permissions: [] };
const MANAGER = {
  id: 49,
  role: 'avocat',
  tenantId: 25,
  permissions: ['manage_settings'],
};
const EMPLOYEE = { id: 50, role: 'avocat', tenantId: 25, permissions: [] };

describe('GET /api/settings/app - configuration SMTP', () => {
  const controller = new AppSettingsController(
    { findByCabinet: jest.fn(async () => cabinetRow()) } as any,
    {} as any,
    {} as any,
  );

  it('admin : smtp_config renvoyée, mot de passe masqué', async () => {
    const body: any = await controller.get({ user: ADMIN } as any);

    expect(body.smtp_config).toEqual({ ...smtp, pass: SMTP_PASSWORD_MASK });
    expect(JSON.stringify(body)).not.toContain('secret-smtp');
  });

  it('titulaire de manage_settings : idem', async () => {
    const body: any = await controller.get({ user: MANAGER } as any);

    expect(body.smtp_config.host).toBe('smtp.test');
    expect(body.smtp_config.pass).toBe(SMTP_PASSWORD_MASK);
  });

  it('employé sans manage_settings : aucune smtp_config', async () => {
    const body: any = await controller.get({ user: EMPLOYEE } as any);

    expect(body).not.toHaveProperty('smtp_config');
    expect(body.invoice_prefix).toBe('FAC-');
    expect(JSON.stringify(body)).not.toContain('secret-smtp');
  });

  it('configuration SMTP vide : pas de masque inventé', async () => {
    const empty = new AppSettingsController(
      {
        findByCabinet: jest.fn(async () => ({
          ...cabinetRow(),
          smtp_config: { host: 'h', port: 25, user: '', pass: '' },
        })),
      } as any,
      {} as any,
      {} as any,
    );

    const body: any = await empty.get({ user: ADMIN } as any);

    expect(body.smtp_config.pass).toBe('');
  });

  it('PUT et reset ne renvoient jamais le mot de passe en clair', async () => {
    const service = {
      update: jest.fn(async () => cabinetRow()),
      reset: jest.fn(async () => cabinetRow()),
    };
    const writer = new AppSettingsController(service as any, {} as any, {} as any);

    const updated: any = await writer.update({ user: ADMIN } as any, {} as any);
    const reset: any = await writer.reset({ user: ADMIN } as any);

    expect(updated.smtp_config.pass).toBe(SMTP_PASSWORD_MASK);
    expect(reset.smtp_config.pass).toBe(SMTP_PASSWORD_MASK);
  });

  it('l’envoi de test SMTP est réservé aux gestionnaires des paramètres', async () => {
    const smtpService = { sendTest: jest.fn(async () => ({ success: true })) };
    const c = new AppSettingsController({} as any, {} as any, smtpService as any);

    await expect(
      c.testSmtp({ user: EMPLOYEE } as any, { to: 'a@b.c' }),
    ).rejects.toThrow('administrateur');
    expect(smtpService.sendTest).not.toHaveBeenCalled();

    await c.testSmtp({ user: ADMIN } as any, { to: 'a@b.c' });
    expect(smtpService.sendTest).toHaveBeenCalledWith(25, 'a@b.c');
  });
});

describe('AppSettingsService.update - mot de passe SMTP', () => {
  function build(stored: object | null) {
    const cabinet: any = { id: 25, smtp_config: stored };
    const repository = {
      findOne: jest.fn(async () => cabinet),
      save: jest.fn(async (entity: unknown) => entity),
    };
    return {
      service: new AppSettingsService(repository as any, {} as any),
      saved: () => (repository.save.mock.calls[0][0] as any).smtp_config,
    };
  }

  it('un mot de passe masqué ne remplace pas celui qui est stocké', async () => {
    const { service, saved } = build({ ...smtp });

    await service.update(25, {
      smtp_config: { ...smtp, host: 'smtp.autre', pass: SMTP_PASSWORD_MASK },
    } as any);

    expect(saved()).toEqual({ ...smtp, host: 'smtp.autre', pass: 'secret-smtp' });
  });

  it('un mot de passe vide ou absent (écran SMTP) reste inchangé', async () => {
    for (const pass of ['', undefined, null]) {
      const { service, saved } = build({ ...smtp });
      const { pass: _omitted, ...withoutPass } = smtp;

      await service.update(25, {
        smtp_config: pass === undefined ? withoutPass : { ...smtp, pass },
      } as any);

      expect(saved().pass).toBe('secret-smtp');
    }
  });

  it('un nouveau mot de passe est enregistré', async () => {
    const { service, saved } = build({ ...smtp });

    await service.update(25, { smtp_config: { ...smtp, pass: 'nouveau' } } as any);

    expect(saved().pass).toBe('nouveau');
  });

  it('première configuration sans mot de passe : aucun masque stocké', async () => {
    const { service, saved } = build(null);

    await service.update(25, {
      smtp_config: { host: 'h', port: 25, pass: SMTP_PASSWORD_MASK },
    } as any);

    expect(saved()).toEqual({ host: 'h', port: 25 });
  });

  it('smtp_config à null efface la configuration', async () => {
    const { service, saved } = build({ ...smtp });

    await service.update(25, { smtp_config: null } as any);

    expect(saved()).toBeNull();
  });

  it('une mise à jour sans smtp_config laisse la configuration intacte', async () => {
    const { service, saved } = build({ ...smtp });

    await service.update(25, { invoice_prefix: 'F-' } as any);

    expect(saved()).toEqual(smtp);
  });
});
