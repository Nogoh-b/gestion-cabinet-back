import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import { RequestUserContext } from './request-user.context';
import { assertDistinctActor } from './separation-of-duties';

const as = (role: string, fn: () => void) =>
  new RequestUserContext().run({ userId: 7, role, permissions: [] }, fn);

describe('assertDistinctActor', () => {
  it('laisse passer deux personnes distinctes', () => {
    expect(() => as('lawyer', () => assertDistinctActor(3, 7, 'x'))).not.toThrow();
    expect(() => as('lawyer', () => assertDistinctActor(null, 7, 'x'))).not.toThrow();
  });

  it('refuse la même personne hors admin', () => {
    expect(() =>
      as('accountant', () =>
        assertDistinctActor(7, 7, 'Le préparateur ne peut pas valider son propre bulletin'),
      ),
    ).toThrow(ForbiddenException);
  });

  it("autorise l'admin du cabinet à enchaîner les étapes", () => {
    expect(() => as('admin', () => assertDistinctActor(7, 7, 'x'))).not.toThrow();
  });
});
