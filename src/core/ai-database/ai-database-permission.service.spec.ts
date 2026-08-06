import { ForbiddenException } from '@nestjs/common';

import { AiDatabasePermissionService } from './ai-database-permission.service';

describe('AiDatabasePermissionService', () => {
  const usersService = {
    getUserPermissions: jest.fn(),
  };
  const dataSource = {
    entityMetadatas: [
      { tableName: 'dossiers' },
      { tableName: 'user' },
      { tableName: 'auth_tokens' },
    ],
  };
  let service: AiDatabasePermissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiDatabasePermissionService(
      usersService as any,
      dataSource as any,
    );
  });

  it('refuse une table IAM meme a un administrateur', async () => {
    await expect(
      service.assertCanReadSql(
        { id: 1, role: 'admin' },
        'SELECT id, email FROM user',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse les jetons meme a un super administrateur', async () => {
    await expect(
      service.assertCanReadTables(
        { id: 1, permissions: ['SUPER_ADMIN'] },
        ['auth_tokens'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse une colonne sensible sur une table metier', async () => {
    await expect(
      service.assertCanReadSql(
        { id: 1, role: 'admin' },
        'SELECT d.password_hash FROM dossiers d',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignore les mots sensibles presents uniquement dans une valeur litterale', async () => {
    await expect(
      service.assertCanReadSql(
        { id: 1, role: 'admin' },
        "SELECT d.id FROM dossiers d WHERE d.title = 'token'",
      ),
    ).resolves.toBeUndefined();
  });

  it('applique la permission de table aux non-administrateurs', async () => {
    await expect(
      service.assertCanReadTables(
        { id: 2, permissions: ['view_dossiers'] },
        ['dossiers'],
      ),
    ).resolves.toBeUndefined();

    await expect(
      service.assertCanReadTables(
        { id: 3, permissions: [] },
        ['dossiers'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('retire les tables protegees du schema IA', () => {
    expect(
      service.filterAllowedTables(['dossiers', 'USER', 'auth_tokens']),
    ).toEqual(['dossiers']);
  });
});
