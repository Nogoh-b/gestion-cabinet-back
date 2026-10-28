/// <reference types="jest" />
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  buildAiScopedTables,
  scopeCabinetOperations,
} from './ai-scoped-tables';
import { injectTenantFilter } from './tenant-injection';

const plan = (operation: any) => ({
  operations: [
    {
      entity: 'cabinets',
      fields: { address: 'Douala' },
      humanReadable: '',
      ...operation,
    },
  ],
});

describe('scopeCabinetOperations', () => {
  it('vise toujours le cabinet courant', () => {
    const scoped = scopeCabinetOperations(
      plan({ operation: 'UPDATE', match: { name: 'Autre' }, all: true }),
      25,
    );
    expect(scoped.operations[0]).toMatchObject({ entityId: 25 });
    expect(scoped.operations[0]).not.toHaveProperty('match');
    expect(scoped.operations[0]).not.toHaveProperty('all');
  });

  it("refuse l'identifiant d'un autre cabinet", () => {
    expect(() =>
      scopeCabinetOperations(plan({ operation: 'UPDATE', entityId: 7 }), 25),
    ).toThrow(ForbiddenException);
  });

  it('refuse création et suppression', () => {
    expect(() =>
      scopeCabinetOperations(plan({ operation: 'INSERT' }), 25),
    ).toThrow(BadRequestException);
    expect(() =>
      scopeCabinetOperations(plan({ operation: 'DELETE', entityId: 25 }), 25),
    ).toThrow(BadRequestException);
  });

  it('refuse sans cabinet courant', () => {
    expect(() =>
      scopeCabinetOperations(plan({ operation: 'UPDATE' }), null),
    ).toThrow(ForbiddenException);
  });

  it('laisse les plans sans cabinet inchangés', () => {
    const other = {
      operations: [
        {
          entity: 'dossiers',
          operation: 'UPDATE',
          fields: {},
          humanReadable: '',
        },
      ],
    } as any;
    expect(scopeCabinetOperations(other, null)).toBe(other);
  });
});

describe('buildAiScopedTables', () => {
  it("limite les e-mails à ceux reçus par l'utilisateur", () => {
    const sql = injectTenantFilter('SELECT m.subject FROM mails m', {
      tenantId: 25,
      tenantTables: new Set(['mails']),
      scopedTables: buildAiScopedTables({
        tenantId: 25,
        userId: 4,
        email: "O'Brien@cabinet.cm",
      }),
    });
    expect(sql).toBe(
      "SELECT m.subject FROM mails m WHERE m.tenant_id = 25 AND FIND_IN_SET('o''brien@cabinet.cm', REPLACE(m.`to`, ' ', '')) > 0",
    );
  });

  it('préférences : celles de l’utilisateur seulement', () => {
    const sql = injectTenantFilter('SELECT user_language FROM user_settings', {
      tenantId: 25,
      tenantTables: new Set(),
      scopedTables: buildAiScopedTables({ tenantId: 25, userId: 4 }),
    });
    expect(sql).toBe(
      'SELECT user_language FROM user_settings WHERE user_settings.`user_id` = 4',
    );
  });
});
