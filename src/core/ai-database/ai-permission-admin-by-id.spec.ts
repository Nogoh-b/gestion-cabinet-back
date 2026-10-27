import { ForbiddenException } from '@nestjs/common';

import { AiDatabasePermissionService } from './ai-database-permission.service';

/**
 * Les créations en cascade (choix « Créer « X » », auto-création) ne passent
 * qu'un userId au contrôle IA : le rôle admin doit être relu en DB, sinon
 * l'admin se voit refuser les codes legacy que son rôle ne liste pas.
 */
describe('Contrôle IA appelé avec un simple userId', () => {
  function service(role: string, codes: string[]) {
    const usersService = {
      getUserPermissions: jest.fn().mockResolvedValue(codes.map((code) => ({ code }))),
      findOne: jest.fn().mockResolvedValue({ role }),
    };
    const permissions = new AiDatabasePermissionService(usersService as any, {} as any);
    (permissions as any).logger = { warn: jest.fn(), log: jest.fn() };
    return permissions;
  }
  const insertJurisdiction = {
    transaction: false,
    humanReadable: '',
    confidence: 1,
    operations: [{ operation: 'INSERT' as const, entity: 'jurisdictions', fields: {}, humanReadable: '' }],
  };

  it("laisse l'admin créer une juridiction sans le code legacy MANAGE_JURISDICTIONS", async () => {
    await expect(
      service('admin', ['manage_settings']).assertCanWritePlan('1', insertJurisdiction),
    ).resolves.toBeUndefined();
  });

  it('refuse toujours un autre rôle sans le droit', async () => {
    await expect(
      service('avocat', ['view_dossiers']).assertCanWritePlan('31', insertJurisdiction),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
