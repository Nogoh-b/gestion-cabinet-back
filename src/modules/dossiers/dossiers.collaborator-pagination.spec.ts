import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { DossiersService } from './dossiers.service';

/**
 * GET /dossiers/collaborator/:id — sans ValidationPipe global, page/limit et
 * l'identifiant de route arrivent en TEXTE : `10 + '10'` donnait '1010', et
 * `c.id === '5'` écartait tous les dossiers.
 */
function build(dossierCount: number, collaboratorId = 5) {
  const dossiers = Array.from({ length: dossierCount }, (_, index) => ({
    id: index + 1,
    collaborators: [{ id: collaboratorId }],
  }));
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn(async () => dossiers),
  };
  const service = Object.create(DossiersService.prototype) as any;
  service.userRepository = { findOne: jest.fn(async () => ({ id: 5 })) };
  service.dossierRepository = { createQueryBuilder: jest.fn(() => qb) };
  service.mapToResponseDto = jest.fn(async (d: { id: number }) => ({ id: d.id }));
  return service as DossiersService;
}

const query = (page?: unknown, limit?: unknown) =>
  ({ page, limit }) as any;

describe('DossiersService.getCollaboratorDossiers - pagination', () => {
  it('convertit page/limit reçus en texte (pas de concaténation)', async () => {
    const service = build(25);

    const result = await service.getCollaboratorDossiers(
      '5' as any,
      query('2', '10'),
    );

    expect(result.meta).toMatchObject({
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(result.data.map((d: { id: number }) => d.id)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('applique les défauts 1/10 quand une valeur manque ou est invalide', async () => {
    const service = build(25);

    const onlyPage = await service.getCollaboratorDossiers(5, query('3'));
    expect(onlyPage.meta).toMatchObject({ page: 3, limit: 10 });
    expect(onlyPage.data).toHaveLength(5);

    const garbage = await service.getCollaboratorDossiers(
      5,
      query('abc', '-4'),
    );
    expect(garbage.meta).toMatchObject({ page: 1, limit: 10 });
    expect(Number.isNaN(garbage.meta.page)).toBe(false);
  });

  it('plafonne la limite à 500 et tronque les décimales', async () => {
    const service = build(3);

    const capped = await service.getCollaboratorDossiers(5, query('1', '9999'));
    expect(capped.meta.limit).toBe(500);

    const decimal = await service.getCollaboratorDossiers(5, query('2.9', '1.5'));
    expect(decimal.meta).toMatchObject({ page: 2, limit: 1 });
    expect(decimal.data).toHaveLength(1);
  });

  it('sans page ni limite, renvoie la liste complète', async () => {
    const service = build(12);

    const all = await service.getCollaboratorDossiers(5, query());

    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(12);
  });

  it('collaborateur sans dossier : méta cohérente avec les valeurs converties', async () => {
    const service = build(0);

    const empty = await service.getCollaboratorDossiers(5, query('2', '10'));

    expect(empty).toEqual({
      data: [],
      meta: {
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('compare l’identifiant de route (texte) aux collaborateurs numériques', async () => {
    const service = build(4, 5);

    const result = await service.getCollaboratorDossiers('5' as any, query());

    expect(result).toHaveLength(4);
  });

  it('refuse un identifiant de collaborateur invalide', async () => {
    const service = build(1);

    await expect(
      service.getCollaboratorDossiers('abc' as any, query('1', '10')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
