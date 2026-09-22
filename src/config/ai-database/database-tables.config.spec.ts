import { describe, expect, it } from '@jest/globals';
import { DATABASE_TABLES_CONFIG, DOMAIN_ENTITIES } from './database-tables.config';

const config = DATABASE_TABLES_CONFIG!;
const domainEntities = DOMAIN_ENTITIES!;

describe('Configuration des tables IA du cabinet', () => {
  it('expose le traitement et la facturation orientés actions', () => {
    expect(config.essentialTables).toEqual(
      expect.arrayContaining([
        'dossier_actions',
        'dossier_recommendations',
        'dossier_billing_profiles',
        'dossier_billing_rules',
        'billable_items',
        'invoice_lines',
      ]),
    );
  });

  it('exclut complètement les tables de l’ancien moteur de procédure', () => {
    const legacyTables = [
      'procedure_instances',
      'procedure_templates',
      'stages',
      'stage_visits',
      'sub_stages',
      'sub_stage_visits',
      'transitions',
      'cycles',
      'tasks',
      'stage_configs',
      'decisions',
    ];

    expect(config.ignoredTables).toEqual(
      expect.arrayContaining(legacyTables),
    );
    expect(config.essentialTables).not.toEqual(
      expect.arrayContaining(legacyTables),
    );
  });

  it('reconnaît les demandes de suivi sur les actions et éléments facturables', () => {
    expect(domainEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'action de traitement' }),
        expect.objectContaining({ label: 'element facturable' }),
      ]),
    );
  });
});
