/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import { AiDatabasePermissionService } from './ai-database-permission.service';

// Question « actions en retard » : la requête générée joint `user` pour afficher
// le responsable (règle de présentation du prompt). Un avocat sans « Voir les
// utilisateurs » doit obtenir la liste, sans le nom du responsable.
const overdueActionsSql = `SELECT da.title, d.dossier_number, CONCAT(u.first_name, ' ', u.last_name) AS responsable
FROM dossier_actions da
JOIN dossiers d ON d.id = da.dossier_id
LEFT JOIN user u ON u.id = da.responsible_user_id
WHERE da.due_date < CURDATE() AND da.status <> 2
LIMIT 50`;

function createPermissionService(codes: string[]) {
  const usersService = {
    getUserPermissions: jest
      .fn()
      .mockResolvedValue(codes.map((code) => ({ code }))),
    findOne: jest.fn().mockResolvedValue({ role_name: 'Avocat' }),
  };
  const service = new AiDatabasePermissionService(
    usersService as any,
    {} as any,
  );
  (service as any).logger = { warn: jest.fn(), log: jest.fn() };
  return service;
}

const lawyerWithoutUsers = ['view_dossiers', 'view_dossier_actions'];

describe('Jointures vers une table non lisible retirées avant contrôle', () => {
  it('retire la jointure vers user pour un utilisateur sans « Voir les utilisateurs »', async () => {
    const service = createPermissionService(lawyerWithoutUsers);
    const user = { userId: 31 };

    const pruned = await service.pruneUnreadableJoins(user, overdueActionsSql);

    expect(pruned).not.toMatch(/\buser\b|responsable/);
    await expect(
      service.assertCanReadSql(user, pruned),
    ).resolves.toBeUndefined();
  });

  it('retire aussi la jointure pour qui lit les utilisateurs : user est protégée pour tous', async () => {
    // « user » (mots de passe, jetons) est refusée à l'assistant quel que soit
    // le rôle : garder la jointure faisait refuser toute la demande.
    const service = createPermissionService([
      ...lawyerWithoutUsers,
      'view_users',
    ]);
    const user = { userId: 31 };
    const pruned = await service.pruneUnreadableJoins(user, overdueActionsSql);
    expect(pruned).not.toMatch(/\buser\b|responsable/);
    await expect(service.assertCanReadSql(user, pruned)).resolves.toBeUndefined();
  });

  it('point sur un dossier : la jointure protégée ajoutée par le correcteur est retirée', async () => {
    const service = createPermissionService(['view_dossiers', 'view_dossier_actions', 'view_clients']);
    const user = { userId: 31 };
    const sql = `SELECT d.dossier_number, c.full_name AS client, CONCAT(u.first_name, ' ', u.last_name) AS avocat
FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id LEFT JOIN user u ON u.id = d.lawyer_id
WHERE d.dossier_number = 'DOS-7-0001' LIMIT 50`;
    const pruned = await service.pruneUnreadableJoins(user, sql);
    expect(pruned).toContain('c.full_name AS client');
    expect(pruned).not.toMatch(/\buser\b/);
  });

  it('garde le refus quand le nom du responsable sert à filtrer', async () => {
    const service = createPermissionService(lawyerWithoutUsers);
    const user = { userId: 31 };
    const filtered = `SELECT da.title FROM dossier_actions da
LEFT JOIN user u ON u.id = da.responsible_user_id
WHERE u.last_name = 'Dupont'`;

    const sql = await service.pruneUnreadableJoins(user, filtered);

    expect(sql).toBe(filtered);
    await expect(service.assertCanReadSql(user, sql)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
