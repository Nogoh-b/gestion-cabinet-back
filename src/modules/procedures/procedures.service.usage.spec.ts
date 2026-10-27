import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from 'src/core/enums/user-role.enum';
import { RequestUserContext } from 'src/core/security/request-user.context';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { ProceduresService } from './procedures.service';

/**
 * Supprimer un type de procédure : le contrôle « encore utilisé ? » doit voir
 * TOUS les dossiers du cabinet. `repository.count()` passe par le filtre de
 * confidentialité : pour un non-admin, un type utilisé uniquement par un
 * dossier confidentiel paraîtrait libre et serait supprimé.
 */
const tenantContext = new TenantContext();
const userContext = new RequestUserContext();

function build(usedByDossiers: number) {
  const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const qb: any = {
    expressionMap: { mainAlias: { metadata: { target: Dossier } } },
    where: jest.fn((sql: string, params?: Record<string, unknown>) => {
      calls.push({ sql, params });
      return qb;
    }),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      calls.push({ sql, params });
      return qb;
    }),
    getCount: jest.fn(async () => usedByDossiers),
  };
  const dossierRepository = {
    // `count` est celui que le patch de confidentialité filtre : ne pas l'utiliser.
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(() => qb),
  };
  const procedureTypeRepository = {
    findOne: jest.fn(async () => ({ id: 7, subtypes: [], dossiers: [] })),
    softDelete: jest.fn(async () => undefined),
  };
  const service = new ProceduresService(
    procedureTypeRepository as any,
    dossierRepository as any,
    {} as any,
    {} as any,
  );
  return { service, dossierRepository, procedureTypeRepository, qb, calls };
}

/** Avocat ordinaire : ne contourne pas la confidentialité. */
function asLawyer<T>(fn: () => T): T {
  return tenantContext.run(25, () =>
    userContext.run(
      { userId: 12, role: UserRole.AVOCAT, permissions: [] },
      fn,
    ),
  );
}

describe('ProceduresService.remove - type encore utilisé', () => {
  it('refuse la suppression quand seul un dossier confidentiel l’utilise', async () => {
    const { service, procedureTypeRepository, dossierRepository } = build(1);

    await expect(asLawyer(() => service.remove(7))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(procedureTypeRepository.softDelete).not.toHaveBeenCalled();
    // Aucun passage par repository.count (donc par le filtre de visibilité).
    expect(dossierRepository.count).not.toHaveBeenCalled();
  });

  it('supprime un type réellement inutilisé', async () => {
    const { service, procedureTypeRepository } = build(0);

    await asLawyer(() => service.remove(7));

    expect(procedureTypeRepository.softDelete).toHaveBeenCalledWith(7);
  });

  it('compte type ET sous-type, limité au cabinet courant, sans filtre de confidentialité', async () => {
    const { service, calls } = build(0);

    await asLawyer(() => service.remove(7));

    expect(calls[0].sql).toContain('dossier.procedure_type_id = :procedureTypeId');
    expect(calls[0].sql).toContain(
      'dossier.procedure_subtype_id = :procedureTypeId',
    );
    expect(calls[0].params).toEqual({ procedureTypeId: 7 });
    expect(calls).toContainEqual({
      sql: 'dossier.tenant_id = :_tenantId',
      params: { _tenantId: 25 },
    });
    // Ni confidentiality_level ni autorisation nominative dans la requête.
    expect(JSON.stringify(calls)).not.toMatch(/confidential|access_grant/);
  });
});

describe('ProceduresService - dossier_count affiché', () => {
  it('reflète tous les dossiers du cabinet, confidentiels compris', async () => {
    const { service, dossierRepository } = build(3);

    const dto = await asLawyer(() =>
      (service as any).mapToResponseDto({
        id: 7,
        name: 'Divorce',
        subtypes: [],
        dossiers: [],
      }),
    );

    expect(dto.dossier_count).toBe(3);
    expect(dossierRepository.count).not.toHaveBeenCalled();
  });
});
