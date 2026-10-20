/**
 * Les routes qui appellent le modèle passent par AiQuotaGuard (module IA du
 * plan + quota). Séparé de ai-quota.guard.spec.ts : importer le contrôleur
 * compile tout le service ai-database.
 */
import { describe, expect, it } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AiDatabaseController } from '../ai-database.controller';
import { AiQuotaGuard } from './ai-quota.guard';

describe('Routes IA protégées par AiQuotaGuard', () => {
  const guardsOf = (handler: keyof AiDatabaseController) =>
    Reflect.getMetadata(GUARDS_METADATA, AiDatabaseController.prototype[handler]) ?? [];

  it.each(['prepareForm', 'askQuestion', 'askStream', 'analyze'] as const)(
    '%s appelle le modèle : module IA et quota vérifiés',
    (handler) => {
      expect(guardsOf(handler)).toContain(AiQuotaGuard);
    },
  );
});
