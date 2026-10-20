/// <reference types="jest" />
// Faits donnés aux messages selon le sujet de la demande (20/10/2026) : un
// WhatsApp « concernant les factures impayées » cite les factures non
// soldées, pas les audiences ; client et dossier mentionnés → le dossier.
import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import { Audience } from '../audiences/entities/audience.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Facture } from '../facture/entities/facture.entity';
import { WhatsappSkill } from './communication.skills';
import { SkillTargetsService, TargetInfo, requestTopics } from './skill-targets.service';

const FACTURES = [
  {
    numero: 'FAC-2026-0012', dateFacture: new Date(2026, 7, 1), dateEcheance: new Date(2026, 8, 1), montantTTC: 500000,
    libelle: 'Honoraires de procédure', paiements: [{ montant: 200000 }],
  },
  { numero: 'FAC-2026-0019', dateFacture: new Date(2026, 9, 1), dateEcheance: new Date(2099, 0, 1), montantTTC: 150000, paiements: [] },
  { numero: 'FAC-2026-0020', dateFacture: new Date(2026, 9, 2), dateEcheance: null, montantTTC: 80000, paiements: [{ montant: 80000 }] },
];

function dataSource() {
  const builder = (rows: any[]) => {
    const qb: any = {
      leftJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb, orderBy: () => qb, take: () => qb,
      getMany: async () => rows, getOne: async () => null,
    };
    return qb;
  };
  const repos = new Map<any, any>([
    [Facture, { createQueryBuilder: () => builder(FACTURES) }],
    [Audience, { createQueryBuilder: () => builder([{ audience_date: new Date(2026, 9, 15), status: 1, decision: 'Renvoi', jurisdiction: { name: "Cour d'Appel de Yaoundé" } }]) }],
    [DossierAction, { find: async () => [{ title: 'Faire signer le document', status: 'IN_PROGRESS', started_at: new Date(2026, 9, 1), due_at: new Date(2026, 9, 15) }] }],
    [Diligence, { find: async () => [] }],
    [DocumentCustomer, { find: async () => [] }],
  ]);
  return { getRepository: (entity: any) => repos.get(entity) } as any;
}

const permissions = (missing: string[] = []) => ({
  missingPermissions: jest.fn(async (_user: any, codes: string[]) => codes.filter((code) => missing.includes(code))),
}) as any;

const dossierInfo: TargetInfo = {
  type: 'dossier',
  table: 'dossiers',
  id: 90,
  label: 'Dossier DOS-2026-0038',
  resource: { id: 90 },
  dossier: { id: 90, dossier_number: 'DOS-2026-0038', object: 'Recouvrement de loyers' } as any,
  client: { id: 66, full_name: 'Émilie LEFÈVRE', number_phone_1: '677000000' } as any,
  employee: null,
  recipientName: 'Émilie LEFÈVRE',
  email: null,
  phone: '677000000',
  mailEntity: { type: 'dossier', id: 90 },
  mailParent: null,
};

describe('sujet de la demande', () => {
  it.each([
    ['concernant les factures impayées', { billing: true, activity: false }],
    ['relance pour le solde de ses honoraires', { billing: true, activity: false }],
    ['fais le récapitulatif des actions menées', { billing: false, activity: true }],
    ["rappelle-lui l'audience de demain", { billing: false, activity: true }],
    ['bonjour, merci de passer au cabinet', { billing: false, activity: false }],
  ])('« %s »', (question, expected) => {
    expect(requestTopics(question)).toEqual(expected);
  });
});

describe('faits selon le sujet', () => {
  it('factures impayées : factures non soldées, reste dû, retard ; pas d’activité du dossier', async () => {
    const service = new SkillTargetsService(dataSource(), permissions());
    const facts = await service.facts(dossierInfo, { id: 12 }, 'je veux preparer un whatsapp concernant les factures impayées');
    expect(facts).toContain('Factures non soldées du dossier DOS-2026-0038 : 2 facture(s)');
    expect(facts).toMatch(/Facture FAC-2026-0012 du 01\/08\/2026 \(Honoraires de procédure\) — montant TTC 500.000 FCFA, déjà payé 200.000 FCFA, reste dû 300.000 FCFA — échéance 01\/09\/2026 \(en retard de \d+ jours\)/);
    expect(facts).toContain('Facture FAC-2026-0019');
    expect(facts).not.toContain('FAC-2026-0020'); // soldée
    expect(facts).not.toContain('Activité du dossier');
    expect(facts).not.toContain("Cour d'Appel");
  });

  it('récapitulatif demandé avec les factures : les deux', async () => {
    const service = new SkillTargetsService(dataSource(), permissions());
    const facts = await service.facts(dossierInfo, { id: 12 }, 'récapitulatif des actions menées et des factures impayées');
    expect(facts).toContain('Activité du dossier');
    expect(facts).toContain('Factures non soldées');
  });

  it('une échéance passée est signalée comme dépassée', async () => {
    const service = new SkillTargetsService(dataSource(), permissions());
    const facts = await service.facts(dossierInfo, { id: 12 }, 'fais le point sur le dossier');
    expect(facts).toContain('Action « Faire signer le document » : en cours (échéance dépassée depuis le 15/10/2026)');
  });

  it('sans le droit de voir les factures : rien sur les montants', async () => {
    const service = new SkillTargetsService(dataSource(), permissions(['view_factures']));
    const facts = await service.facts(dossierInfo, { id: 12 }, 'concernant les factures impayées');
    expect(facts).not.toContain('FAC-2026-0012');
    expect(facts).toContain("non consultables avec les droits de l'utilisateur");
  });
});

describe('WhatsApp au client sur l’un de ses dossiers', () => {
  it('client et dossier mentionnés : faits du dossier, destinataire le client', async () => {
    const clientInfo: TargetInfo = { ...dossierInfo, type: 'client', table: 'customer', id: 66, label: 'Émilie LEFÈVRE', dossier: null, resource: { id: 66 } };
    const targets: any = {
      load: jest.fn(async (target: any) => (target.type === 'dossier' ? dossierInfo : clientInfo)),
      facts: jest.fn(async () => 'faits'),
      sender: jest.fn(async () => ({ name: 'Me Nogoh', title: 'Avocat', cabinetName: 'Cabinet', cabinetAddress: '' })),
    };
    const complete = jest.fn(async () => '{"text": "Bonjour Madame"}');
    const ctx: AiSkillContext = {
      question: 'je veux envoyer un whatsap concernant le dossier',
      references: [
        { type: 'client', label: 'Émilie LEFÈVRE', data: { id: 66 } },
        { type: 'dossier', label: '#DOS-2026-0038 — Émilie LEFÈVRE', data: { id: 90 } },
      ],
      documents: [],
      params: {},
      user: { id: 12 },
      userId: '12',
      history: [],
      llm: { complete, stream: jest.fn() } as any,
      status: jest.fn(),
      readDocuments: jest.fn(async () => []),
      legalSources: jest.fn(async () => ''),
    };
    const outcome: any = await new WhatsappSkill(targets).run(ctx);
    expect(targets.facts).toHaveBeenCalledWith(dossierInfo, ctx.user, ctx.question);
    expect(outcome.draft).toMatchObject({ customerId: 66, recipientName: 'Émilie LEFÈVRE', text: 'Bonjour Madame' });
  });
});
