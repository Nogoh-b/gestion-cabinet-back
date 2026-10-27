/// <reference types="jest" />
// Activité d'un dossier donnée aux compétences (« récapitulatif des actions
// menées ») : actions, audiences passées, diligences, pièces, selon les droits.
import { Audience } from '../audiences/entities/audience.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { SkillTargetsService } from './skill-targets.service';

const ACTIONS = [
  { title: 'Signifier l’assignation', status: 'COMPLETED', completed_at: new Date(2026, 9, 2), result_notes: 'Signifiée à personne' },
  { title: 'Préparer les conclusions', status: 'IN_PROGRESS', started_at: new Date(2026, 9, 10), due_at: new Date(2026, 10, 5) },
];
const AUDIENCES = [
  { audience_date: new Date(2026, 9, 8), status: 2, postponed_to: new Date(2026, 10, 12), decision: 'Renvoi pour conclusions', jurisdiction: { name: 'TPI Douala' } },
];
const DILIGENCES = [
  { title: 'Recherche au RCCM', status: 'completed', completion_date: new Date(2026, 8, 28), findings_summary: 'Société immatriculée' },
  { title: 'Note confidentielle', status: 'completed', completion_date: new Date(2026, 8, 29), confidential: true },
];
const DOCUMENTS = [
  { name: 'Assignation.pdf', created_at: new Date(2026, 8, 30) },
  { name: 'Rapport interne.pdf', created_at: new Date(2026, 9, 1), is_confidential: true },
];

function dataSource() {
  const queryBuilder = {
    leftJoinAndSelect: () => queryBuilder,
    where: () => queryBuilder,
    andWhere: () => queryBuilder,
    orderBy: () => queryBuilder,
    take: () => queryBuilder,
    getMany: async () => AUDIENCES,
  };
  const repos = new Map<any, any>([
    [DossierAction, { find: jest.fn(async () => ACTIONS) }],
    [Audience, { createQueryBuilder: () => queryBuilder }],
    [Diligence, { find: jest.fn(async () => DILIGENCES) }],
    [DocumentCustomer, { find: jest.fn(async () => DOCUMENTS) }],
  ]);
  return { getRepository: (entity: any) => repos.get(entity) } as any;
}

const permissions = (missing: string[] = []) => ({
  missingPermissions: jest.fn(async (_user: any, codes: string[]) => codes.filter((code) => missing.includes(code))),
}) as any;

describe('activité du dossier pour les compétences', () => {
  it('chronologie des actions menées, du plus ancien au plus récent, sans le confidentiel', async () => {
    const service = new SkillTargetsService(dataSource(), permissions());
    const lines = await service.activity(90, { id: 12 });
    const text = lines.join('\n');
    expect(text).toContain('Diligence « Recherche au RCCM » : terminée — conclusions : Société immatriculée');
    expect(text).toContain('Pièce ajoutée : « Assignation.pdf »');
    expect(text).toContain('Action « Signifier l’assignation » : terminée — résultat : Signifiée à personne');
    expect(text).toContain('Audience (TPI Douala) : renvoyée — décision : Renvoi pour conclusions — renvoyée au 12/11/2026');
    expect(text).toContain('Action « Préparer les conclusions » : en cours (échéance 05/11/2026)');
    expect(text).not.toContain('confidentielle');
    expect(text).not.toContain('Rapport interne');
    // Ordre chronologique.
    expect(text.indexOf('RCCM')).toBeLessThan(text.indexOf('Assignation.pdf'));
    expect(text.indexOf('Signifier')).toBeLessThan(text.indexOf('TPI Douala'));
  });

  it('chaque source suit le droit de lecture de l’utilisateur', async () => {
    const service = new SkillTargetsService(dataSource(), permissions(['view_audiences', 'view_documents']));
    const text = (await service.activity(90, { id: 12 })).join('\n');
    expect(text).toContain('Action « Signifier');
    expect(text).not.toContain('TPI Douala');
    expect(text).not.toContain('Assignation.pdf');
  });

  it('limite aux éléments les plus récents', async () => {
    const service = new SkillTargetsService(dataSource(), permissions());
    const lines = await service.activity(90, { id: 12 }, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain('Préparer les conclusions');
  });
});
