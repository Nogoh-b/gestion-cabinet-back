/**
 * Changement de mot de passe par l'utilisateur connecté (POST /auth/change-password) :
 * - l'ancien mot de passe est vérifié (bcrypt) → 400 s'il est faux, rien n'est écrit ;
 * - le nouveau suit la règle de ResetPasswordDto (8+, maj, min, chiffre, spécial) ;
 * - le hash (coût 12) est écrit dans le contexte du cabinet du jeton ;
 * - l'e-mail `password_changed` est envoyé, sans bloquer si l'envoi échoue.
 *
 * Note : les globals jest sont importés explicitement car le tsconfig du
 * projet restreint `types` (pas de @types/jest global sous ts-jest).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  getCurrentTenantId,
  hasActiveTenant,
  TenantContext,
} from '../tenant/tenant.context';

// Vrai bcrypt au coût 12 : plusieurs secondes quand toute la suite tourne en
// parallèle, au-delà des 5 s par défaut.
jest.setTimeout(30_000);

const CURRENT = 'Ancien123!';
const NEXT = 'Nouveau456$';
const CABINET = 25;

const account = (overrides: Record<string, unknown> = {}) => ({
  id: 50,
  email: 'client@cabinet.test',
  username: 'client',
  first_name: 'Awa',
  password: bcrypt.hashSync(CURRENT, 4),
  role: 'client',
  status: 1,
  tenant_id: CABINET,
  ...overrides,
});

function buildService(
  options: { user?: any; mailFails?: boolean } = {},
) {
  const user = 'user' in options ? options.user : account();
  const tenants: Array<{ method: string; tenant: number | 'no-context' }> = [];
  const snap = (method: string) =>
    tenants.push({
      method,
      tenant: hasActiveTenant() ? getCurrentTenantId() : 'no-context',
    });

  const usersService = {
    findById: jest.fn(async (_id: number) => {
      snap('findById');
      return user;
    }),
    update: jest.fn(async (_id: number, _data: any) => {
      snap('update');
    }),
  };
  const mailService = {
    sendDirect: jest.fn(async (_mail: any) => {
      if (options.mailFails) throw new Error('SMTP indisponible');
    }),
  };
  const mailTemplateService = {
    renderOrCreateSystemDefault: jest.fn(async (_code: string, _vars: any) => ({
      subject: 'Mot de passe modifié',
      html: '<p>ok</p>',
    })),
  };

  const service = new AuthService(
    usersService as any,
    {} as any, // employeeService (inutilisé ici)
    {} as any, // jwtService (inutilisé ici)
    mailService as any,
    {} as any, // authTokenService (inutilisé ici)
    new TenantContext(),
    mailTemplateService as any,
    {} as any, // dataSource (inutilisé ici)
  );

  return { service, usersService, mailService, mailTemplateService, tenants };
}

describe('AuthService.changePassword', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('refuse un ancien mot de passe faux (400) sans rien écrire', async () => {
    await expect(
      ctx.service.changePassword(50, CABINET, 'Mauvais123!', NEXT),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.usersService.update).not.toHaveBeenCalled();
    expect(ctx.mailService.sendDirect).not.toHaveBeenCalled();
  });

  it('refuse un compte introuvable ou sans mot de passe (400)', async () => {
    const missing = buildService({ user: null });
    await expect(
      missing.service.changePassword(50, CABINET, CURRENT, NEXT),
    ).rejects.toBeInstanceOf(BadRequestException);

    const noPassword = buildService({ user: account({ password: null }) });
    await expect(
      noPassword.service.changePassword(50, CABINET, CURRENT, NEXT),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(noPassword.usersService.update).not.toHaveBeenCalled();
  });

  it('refuse un nouveau mot de passe hors règle ou identique (400)', async () => {
    for (const weak of ['Co1!a', 'sansmajuscule1!', 'SansSpecial123', CURRENT]) {
      await expect(
        ctx.service.changePassword(50, CABINET, CURRENT, weak),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(ctx.usersService.update).not.toHaveBeenCalled();
  });

  it('écrit le nouveau hash (coût 12) dans le cabinet du jeton et envoie la confirmation', async () => {
    await expect(
      ctx.service.changePassword(50, CABINET, CURRENT, NEXT),
    ).resolves.toEqual({
      success: true,
      message: 'Mot de passe modifié avec succès',
    });

    expect(ctx.usersService.findById).toHaveBeenCalledWith(50);
    expect(ctx.usersService.update).toHaveBeenCalledTimes(1);
    const [id, data] = ctx.usersService.update.mock.calls[0] as [number, any];
    expect(id).toBe(50);
    expect(await bcrypt.compare(NEXT, data.password)).toBe(true);
    expect(await bcrypt.compare(CURRENT, data.password)).toBe(false);
    expect(bcrypt.getRounds(data.password)).toBe(12);

    expect(ctx.tenants).toEqual([
      { method: 'findById', tenant: CABINET },
      { method: 'update', tenant: CABINET },
    ]);

    expect(ctx.mailTemplateService.renderOrCreateSystemDefault).toHaveBeenCalledWith(
      'password_changed',
      expect.objectContaining({ firstName: 'Awa' }),
    );
    expect(ctx.mailService.sendDirect).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@cabinet.test' }),
    );
  });

  it("réussit même si l'e-mail de confirmation échoue", async () => {
    const failing = buildService({ mailFails: true });
    await expect(
      failing.service.changePassword(50, CABINET, CURRENT, NEXT),
    ).resolves.toMatchObject({ success: true });
    expect(failing.usersService.update).toHaveBeenCalledTimes(1);
  });
});

describe('ChangePasswordDto', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(ChangePasswordDto, body))).map(
      (e) => e.property,
    );

  it('accepte un nouveau mot de passe conforme', async () => {
    expect(
      await errorsFor({ current_password: CURRENT, new_password: NEXT }),
    ).toEqual([]);
  });

  it('applique la règle de ResetPasswordDto et exige l’ancien mot de passe', async () => {
    expect(
      await errorsFor({ current_password: CURRENT, new_password: 'abc' }),
    ).toEqual(['new_password']);
    expect(
      await errorsFor({ current_password: CURRENT, new_password: 'Motdepasse123' }),
    ).toEqual(['new_password']);
    expect(await errorsFor({ new_password: NEXT })).toEqual([
      'current_password',
    ]);
  });
});
