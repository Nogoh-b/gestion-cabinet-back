/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import {
  buildCapabilityAnswer,
  isCapabilityQuestion,
  stripSchemaColumns,
} from './ai-access-policy';
import { AiDatabasePermissionService } from './ai-database-permission.service';
import { AiDatabaseService } from './ai-database.service';

// Tables candidates réellement détectées pour une question sur un dossier
// référencé (#DOS-2026-0002) : la détection ramène des voisines bruitées.
const detectedForDossier = [
  'dossiers', 'customer', 'dossier_actions', 'billable_items',
  'dossier_billing_profiles', 'dossier_billing_rules', 'case_action_definitions',
  'dossier_recommendations', 'dossier_action_relations', 'dossier_referral',
  'salary_advance', 'jurisdictions',
];
// Droits observés pour l'avocat du cabinet 22 (user 31) : ni factures, ni
// paie, ni dépenses, mais les éléments facturables des dossiers.
const lawyerPermissions = [
  'view_dossiers', 'create_dossier', 'edit_dossier', 'view_clients',
  'view_dossier_actions', 'view_billable_items', 'view_dossier_referrals',
  'view_audiences', 'create_audience', 'view_documents',
];

function createPermissionService(codes: string[], roleName = 'Avocat') {
  const usersService = {
    getUserPermissions: jest.fn().mockResolvedValue(codes.map((code) => ({ code }))),
    findOne: jest.fn().mockResolvedValue({ role_name: roleName }),
  };
  const service = new AiDatabasePermissionService(usersService as any, {} as any);
  (service as any).logger = { warn: jest.fn(), log: jest.fn() };
  return service;
}

const tableLabels: Record<string, string> = {
  referrer: "Apporteurs d'affaires",
  dossier_referral: 'Apports de dossiers',
  referral_commission: "Commissions d'apporteur",
  dossiers: 'Dossiers',
  salary_advance: 'Avances sur salaire',
  customer: 'Clients',
};

function createAiService(permissionService: AiDatabasePermissionService) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.aiPermissionService = permissionService;
  service.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
  service.schemaMetadata = {
    getTableMetadataForPrompt: (table: string) =>
      tableLabels[table] ? { label: tableLabels[table] } : null,
    getAllVisibleTables: () => Object.keys(tableLabels),
    hasTableMetadata: (table: string) => !!tableLabels[table],
  };
  service.projectConfig = { databaseTablesConfig: { tableSynonyms: {} } };
  service.tableDetectionCache = new Map();
  service.relationshipsCache = new Map();
  service.markMetric = jest.fn();
  return service;
}

describe('Filtrage des tables IA selon les droits de lecture', () => {
  it('retire du schéma les tables voisines non autorisées au lieu de refuser', async () => {
    const service = createAiService(createPermissionService(lawyerPermissions));
    const { tables, refusal } = await service.restrictToReadableTables(
      { id: 31 },
      detectedForDossier,
      "quel est l'état du dossier DOS-2026-0002 ?",
    );
    expect(refusal).toBeUndefined();
    expect(tables).toEqual(detectedForDossier.filter((t) => t !== 'salary_advance'));
  });

  it('refuse clairement une table nommée dans la question, même mal orthographiée', async () => {
    const service = createAiService(
      createPermissionService(lawyerPermissions.filter((code) => code !== 'view_referrers')),
    );
    const { refusal } = await service.restrictToReadableTables(
      { id: 31 },
      ['referrer', 'dossier_referral', 'dossiers'],
      "liste moi les aporteurs d'affaire du cabinnet",
    );
    expect(refusal).toContain('Accès non autorisé');
    expect(refusal).toContain("Apporteurs d'affaires");
    expect(refusal).toContain('« Voir les apporteurs »');
    expect(refusal).toContain('Avocat');
  });

  it('retrouve la table des apporteurs malgré les fautes de frappe', async () => {
    const service = createAiService(createPermissionService(lawyerPermissions));
    const tables = await service.detectRelevantTables(
      "liste moi les aporteurs d'affaire du cabinnet",
    );
    expect(tables[0]).toBe('referrer');
    expect(tables).not.toContain('salary_advance');
  });

  it('écarte aussi une table sans policy IA', async () => {
    const permissions = createPermissionService(['view_dossiers']);
    const { allowed, denied } = await permissions.partitionReadableTables(
      { id: 31 },
      ['dossiers', 'table_inconnue'],
    );
    expect(allowed).toEqual(['dossiers']);
    expect(denied).toEqual(['table_inconnue']);
  });

  it('refuse quand aucune table candidate n est lisible', async () => {
    const service = createAiService(createPermissionService(['view_dossiers']));
    await expect(
      service.restrictToReadableTables({ id: 31 }, ['salary_advance', 'payslip']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('laisse tout passer pour un admin', async () => {
    const service = createAiService(createPermissionService([]));
    const { tables } = await service.restrictToReadableTables(
      { id: 1, role: 'admin' },
      detectedForDossier,
      "liste les apporteurs d'affaires",
    );
    expect(tables).toEqual(detectedForDossier);
  });
});

describe('Contrôle du SQL généré', () => {
  const lawyer = () => createPermissionService(lawyerPermissions);

  it.each([
    ['jointure classique', 'SELECT d.id FROM dossiers d JOIN salary_advance s ON s.id = d.id'],
    ['liste séparée par des virgules', 'SELECT d.id, f.montant_ttc FROM dossiers d, factures f WHERE f.dossier_id = d.id'],
    ['nom qualifié par la base', 'SELECT * FROM `kabysoft`.`factures` LIMIT 5'],
    ['sous-requête', 'SELECT d.id FROM dossiers d WHERE d.id IN (SELECT dossier_id FROM paiements)'],
  ])('refuse une table financière (%s)', async (_label, sql) => {
    await expect(lawyer().assertCanReadSql({ id: 31 }, sql)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ne confond pas un texte entre apostrophes avec une table', async () => {
    await expect(
      lawyer().assertCanReadSql(
        { id: 31 },
        "SELECT d.id FROM dossiers d WHERE d.title LIKE '%from factures%'",
      ),
    ).resolves.toBeUndefined();
  });

  it('refuse une colonne financière d une table lisible avec un message clair', async () => {
    const error = await lawyer()
      .assertCanReadSql({ id: 31 }, 'SELECT d.title, d.budget_estimate FROM dossiers d')
      .catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Voir les factures');
    expect(error.message).toContain('administrateur');
  });

  it('masque les colonnes financières d un SELECT *', async () => {
    const rows = await lawyer().redactRows({ id: 31 }, 'SELECT * FROM dossiers', [
      { id: 1, title: 'A', budget_estimate: 5000, procedure_costs: 100, damages_awarded: 900 },
    ]);
    expect(rows).toEqual([{ id: 1, title: 'A', damages_awarded: 900 }]);
  });

  it('nomme le droit manquant dans le refus', async () => {
    const error = await lawyer()
      .assertCanReadSql({ id: 31 }, 'SELECT * FROM factures')
      .catch((e) => e);
    expect(error.message).toContain('« Voir les factures »');
  });
});

describe('Domaines sensibles demandés explicitement', () => {
  const service = () => createAiService(createPermissionService(lawyerPermissions));

  it.each([
    ['liste les factures impayées du cabinet', 'factures et paiements'],
    ['quel est le salaire de Maître Kouam ?', 'paie'],
    ['montre-moi les écritures comptables du mois', 'comptabilité'],
    ['quelles sont les dépenses de septembre ?', 'dépenses'],
  ])('« %s » → refus clair', async (question, label) => {
    const message = await service().refuseRestrictedDomains({ id: 31 }, question);
    expect(message).toContain('Accès non autorisé');
    expect(message).toContain(label);
    expect(message).toContain('Avocat');
  });

  it.each([
    'quels sont les éléments facturables du dossier DOS-2026-0002 ?',
    'liste les dossiers en cours',
    'quelles audiences ont lieu demain ?',
  ])('« %s » → pas de refus', async (question) => {
    await expect(service().refuseRestrictedDomains({ id: 31 }, question)).resolves.toBeNull();
  });

  it('masque le budget du dossier dans le schéma envoyé au modèle', async () => {
    const schema = [
      '## dossiers — Dossiers',
      '- id int PK',
      '- title varchar « Titre »',
      '- budget_estimate decimal(10,2) « Budget estimé »',
      '## customer — Clients',
      '- budget_estimate varchar',
    ].join('\n');
    const result = await service().hideRestrictedColumns({ id: 31 }, ['dossiers', 'customer'], schema);
    expect(result).not.toContain('- budget_estimate decimal');
    expect(result).toContain('- title varchar');
    expect(result).toContain('## customer');
    expect(result).toContain('- budget_estimate varchar');
  });
});

describe('Questions sur les droits de l utilisateur', () => {
  it.each([
    'tu peux accéder au opérations financières pour moi ?',
    'quels sont les opération que je peux faire dans le système',
    'quelles opérations je peux faire sur un dossier ?',
    "qu'est-ce que je peux faire ?",
    'ai-je accès à la comptabilité ?',
    'quels sont mes droits ?',
  ])('reconnaît « %s »', (question) => {
    expect(isCapabilityQuestion(question)).toBe(true);
  });

  it.each([
    'peux-tu me lister les factures impayées ?',
    'liste les dossiers en cours',
    'comment créer un dossier ?',
    'tu peux accéder au dossier DOS-1 et me donner son statut ?',
  ])('ignore « %s »', (question) => {
    expect(isCapabilityQuestion(question)).toBe(false);
  });

  const lawyerProfile = {
    isAdmin: false,
    roleName: 'Avocat',
    permissions: new Map(lawyerPermissions.map((code) => [code, ''])),
  };

  it('répond « en partie » aux opérations financières selon le rôle', () => {
    const answer = buildCapabilityAnswer(
      'tu peux accéder au opérations financières pour moi ?',
      lawyerProfile,
    );
    expect(answer).toContain('En partie');
    expect(answer).toContain('Facturation des dossiers');
    expect(answer).toMatch(/Non accessible avec votre rôle.*factures et paiements.*paie/);
  });

  it('répond « non » quand aucun droit financier', () => {
    const answer = buildCapabilityAnswer('ai-je accès à la paie ?', lawyerProfile);
    expect(answer).toContain('**Non.**');
    expect(answer).toContain('paie');
  });

  it('liste les opérations possibles sur un dossier', () => {
    const answer = buildCapabilityAnswer(
      'quelles opérations je peux faire sur un dossier ?',
      lawyerProfile,
    );
    expect(answer).toContain('**Dossiers**');
    expect(answer).toContain('créer un dossier');
    expect(answer).not.toContain('Oui.');
    expect(answer).not.toContain('Supprimer un dossier'.toLowerCase());
  });

  it('liste tout le périmètre pour une question générale', () => {
    const answer = buildCapabilityAnswer(
      'quels sont les opération que je peux faire dans le système',
      lawyerProfile,
    );
    expect(answer).toContain('**Audiences**');
    expect(answer).toContain('**Documents**');
    expect(answer).toContain('Non accessible avec votre rôle');
  });

  it('confirme l accès complet à un administrateur', () => {
    const answer = buildCapabilityAnswer('ai-je accès à la comptabilité ?', {
      isAdmin: true,
      roleName: 'Administrateur',
      permissions: new Map(),
    });
    expect(answer).toContain('**Oui.**');
  });
});

it('stripSchemaColumns ne touche que la table visée', () => {
  const schema = '## a\n- x int\n- y int\n## b\n- x int';
  expect(stripSchemaColumns(schema, new Map([['a', ['x']]]))).toBe(
    '## a\n- y int\n## b\n- x int',
  );
});
