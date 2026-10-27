/// <reference types="jest" />
import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import {
  ACT_CHECKLISTS,
  ControleActeSkill,
  LectureJugementSkill,
  similarity,
} from './analysis.skills';
import { computeClaim, parseAmount } from './claim-calculator';
import { addMonths, computeDeadline, deadlineRule, frDate, parseIsoDate } from './legal-deadlines';
import {
  anonymize,
  DecompteCreanceSkill,
  deadlineOperations,
  DelaisProcedureSkill,
  detectLanguage,
  resolveDeadlines,
  splitParagraphs,
  VersionBilingueSkill,
} from './legal-tools.skills';
import { htmlTable, inlineDraft, pdfText } from './skill-templates';
import type { TargetInfo } from './skill-targets.service';

const TODAY = new Date(2026, 9, 20); // 20 octobre 2026

const dossierInfo = (): TargetInfo => ({
  type: 'dossier',
  table: 'dossiers',
  id: 91,
  label: 'Dossier DOS-2026-0001',
  resource: { id: 91 },
  dossier: { id: 91, dossier_number: 'DOS-2026-0001', object: 'Recouvrement de loyers' } as any,
  client: { id: 83, full_name: 'Jean Dupont', email: 'jean@exemple.cm' } as any,
  employee: null,
  recipientName: 'Jean Dupont',
  email: 'jean@exemple.cm',
  phone: null,
  mailEntity: { type: 'dossier', id: 91 },
  mailParent: null,
});

function targetsMock(info: TargetInfo = dossierInfo()) {
  return {
    load: jest.fn(async () => info),
    facts: jest.fn(async () => 'Dossier : DOS-2026-0001'),
    sender: jest.fn(async () => ({ name: 'Me Kaby', title: 'Avocat', cabinetName: 'Cabinet Kaby', cabinetAddress: '' })),
    attachableDocuments: jest.fn(async () => []),
    documentsByIds: jest.fn(async () => []),
  };
}

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: '',
  references: [{ type: 'dossier', label: 'DOS-2026-0001', data: { id: 91 } }],
  documents: [],
  params: {},
  user: { id: 31 },
  userId: '31',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

describe('Délais de procédure', () => {
  it('compte les délais francs OHADA (ni le jour de départ ni le terme)', () => {
    const opposition = deadlineRule('ip_opposition')!;
    // Signifiée le 03/10 : 15 jours francs → l'opposition est encore possible le 19/10.
    expect(frDate(computeDeadline(new Date(2026, 9, 3), opposition).deadline)).toBe('19/10/2026');
    const appel = deadlineRule('appel_civil')!;
    expect(frDate(computeDeadline(new Date(2026, 9, 3), appel).deadline)).toBe('03/01/2027');
  });

  it('ajoute des mois en restant en fin de mois', () => {
    expect(frDate(addMonths(new Date(2026, 0, 31), 1))).toBe('28/02/2026');
    expect(parseIsoDate('2026-02-30')).toBeNull();
  });

  it('calcule les délais demandés et ne crée de diligence que pour ceux à venir', () => {
    const lines = resolveDeadlines([
      { regle: 'ip_opposition', date_depart: '2026-10-15' },
      { regle: 'appel_civil', date_depart: '2026-01-02' },
      { regle: '', libelle: 'Délai spécial', date_depart: '2026-10-10', duree: 20, unite: 'jours', fondement: 'Texte X' },
      { regle: 'ip_appel' },
    ]);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ verified: true, source: 'AUPSRVE, art. 10' });
    expect(lines[1]).toMatchObject({ verified: false, dossierField: 'appeal_deadline' });
    expect(lines[2].source).toContain("proposé par l'IA");
    expect(lines[3].deadline).toBeNull();
    const ops = deadlineOperations(91, lines, TODAY);
    // L'appel du 02/01 est expiré, l'appel sur opposition n'a pas de date.
    expect(ops.map((op) => op.fields.deadline)).toEqual(['2026-10-31', '2026-10-30']);
    expect(ops[0]).toMatchObject({ operation: 'INSERT', entity: 'diligences', fields: { dossier_id: 91, priority: 'critical' } });
  });

  it('prépare les diligences du dossier mentionné, avec le tableau des délais', async () => {
    const skill = new DelaisProcedureSkill(targetsMock() as any);
    const context = ctx({ question: "Délai d'opposition, ordonnance signifiée le 15/10/2026" });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"delais": [{"regle": "ip_opposition", "libelle": "Opposition", "date_depart": "2099-10-15"}]}');
    const outcome: any = await skill.run(context);
    expect(outcome.type).toBe('plan');
    expect(outcome.markdown).toContain('AUPSRVE, art. 10');
    expect(outcome.plan.operations[0]).toMatchObject({ entity: 'diligences', fields: { deadline: '2099-10-31' } });
  });
});

describe('Décompte de créance', () => {
  it('calcule les intérêts simples et impute les acomptes sur les intérêts puis le capital', () => {
    const result = computeClaim({
      principal: 1_000_000,
      rate: 10,
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31),
      fees: [{ label: 'Frais de mise en demeure', amount: 25_000 }],
      payments: [{ date: new Date(2026, 6, 1), amount: 200_000 }],
    });
    // 181 jours sur 1 000 000 à 10 % = 49 589,04 d'intérêts ; l'acompte les solde puis réduit le capital.
    expect(result.imputations[0]).toMatchObject({ onInterest: 49589.04, onCapital: 150410.96 });
    expect(result.capitalDue).toBe(849589.04);
    expect(result.total).toBeCloseTo(849589.04 + result.interestDue + 25_000, 2);
    expect(result.periods).toHaveLength(2);
  });

  it('lit les montants écrits à la française', () => {
    expect(parseAmount('1 500 000 FCFA')).toBe(1500000);
    expect(parseAmount('1.500.000')).toBe(1500000);
    expect(parseAmount('2 500,50')).toBe(2500.5);
    expect(parseAmount('n/a')).toBeNaN();
  });

  it('produit le décompte en PDF et propose la requête en injonction de payer', async () => {
    const skill = new DecompteCreanceSkill(targetsMock() as any, {} as any);
    const context = ctx({ question: '2 500 000 FCFA dus depuis le 15/03/2026, taux 5 %' });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"principal": 2500000, "taux": 5, "date_depart": "2026-03-15", "date_arret": "2026-10-15", "base": 365, "frais": [], "acomptes": []}');
    const outcome: any = await skill.run(context);
    expect(outcome.type).toBe('document_draft');
    expect(outcome.markdown).toContain('Total dû');
    expect(outcome.draft.template.code).toBe('skill_note');
    expect(outcome.draft.rawVariables).toContain('bodyContent');
    expect(outcome.followUps[0]).toMatchObject({ skill: 'injonction_payer', params: { decompte: { principal: 2500000, rate: 5 } } });
  });

  it('demande le principal et la date de départ quand ils manquent', async () => {
    const skill = new DecompteCreanceSkill(targetsMock() as any, {} as any);
    const context = ctx({ question: 'décompte' });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"principal": null, "taux": 0}');
    await expect(skill.run(context)).resolves.toMatchObject({ type: 'clarify' });
  });

  // « Décompte du dossier au 31/10/2026, taux légal 4,5 % » : les factures
  // enregistrées, chacune depuis son échéance, acomptes validés imputés.
  it('dossier sans montant : une ligne par facture non soldée', async () => {
    const unpaid = [
      { numero: 'FAC-2026-0037', montantTTC: '54500.00', dateFacture: '2026-10-10', dateEcheance: '2026-09-10', paiements: [{ datePaiement: '2026-10-01', montant: '25000.00' }] },
      { numero: 'FAC-2026-0040', montantTTC: '3228.00', dateFacture: '2026-10-10', dateEcheance: '2026-12-10', paiements: [] },
    ];
    const qb: any = { leftJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb, orderBy: () => qb, getMany: async () => unpaid };
    const dataSource = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    const skill = new DecompteCreanceSkill(targetsMock() as any, dataSource as any);
    const context = ctx({ question: 'Décompte du dossier au 31/10/2026, taux légal 4,5 %' });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"taux": 4.5, "date_arret": "2026-10-31", "base": 365, "frais": []}');

    const outcome: any = await skill.run(context);

    expect(outcome.type).toBe('document_draft');
    expect(outcome.markdown).toContain('2 facture(s) non soldée(s)');
    expect(outcome.markdown).toContain('FAC-2026-0037');
    expect(outcome.markdown).toMatch(/10\/12\/2026 \(non échue\)/);
    const { decompte } = outcome.followUps[0].params;
    expect(decompte.principal).toBe(57728);
    expect(decompte.acomptes).toBe(25000);
    expect(decompte.factures).toHaveLength(2);
    // FAC-0040 non échue au 31/10 : son dû reste le principal.
    expect(decompte.factures[1].du).toBe(3228);
    expect(decompte.interets).toBeGreaterThan(0);
  });
});

describe('Lecture d’un jugement', () => {
  it('enregistre la décision et crée les diligences de recours sur le dossier', async () => {
    const skill = new LectureJugementSkill(targetsMock() as any);
    const context = ctx({ documents: [{ name: 'jugement.pdf', content: 'PAR CES MOTIFS, condamne la SARL X à payer 3 000 000 FCFA…' }] });
    (context.llm.complete as jest.Mock).mockResolvedValue(JSON.stringify({
      juridiction: 'TPI de Douala-Bonanjo', date_decision: '2099-09-01', nature: 'contradictoire', matiere: 'civile',
      dispositif: 'Condamne la SARL X à payer 3 000 000 FCFA', condamnations: [{ debiteur: 'SARL X', creancier: 'Jean Dupont', objet: 'loyers', montant: 3000000 }],
      issue_pour_le_client: 'favorable', recours: [{ regle: 'appel_civil', date_depart: '2099-09-10' }], points_attention: [],
    }));
    const outcome: any = await skill.run(context);
    expect(outcome.type).toBe('plan');
    expect(outcome.plan.operations[0]).toMatchObject({
      operation: 'UPDATE', entity: 'dossiers', entityId: 91,
      fields: { final_decision: 'Condamne la SARL X à payer 3 000 000 FCFA', appeal_deadline: '2099-12-10', appeal_possibility: true },
    });
    expect(outcome.plan.operations[1]).toMatchObject({ operation: 'INSERT', entity: 'diligences' });
    expect(outcome.markdown).toContain('3 000 000 FCFA');
  });

  it('demande la décision quand rien n’est joint', async () => {
    const skill = new LectureJugementSkill(targetsMock() as any);
    await expect(skill.run(ctx())).resolves.toMatchObject({ type: 'clarify' });
  });
});

describe('Contrôle des mentions d’un acte', () => {
  it('contrôle la liste de l’AUPSRVE pour une requête en injonction de payer', async () => {
    const skill = new ControleActeSkill();
    const context = ctx({ params: { text: 'Requête aux fins d’injonction de payer… somme de 1 000 000 FCFA' } });
    (context.llm.complete as jest.Mock)
      .mockResolvedValueOnce('{"type": "requete_injonction_payer", "libelle": "requête"}')
      .mockResolvedValueOnce(JSON.stringify({
        mentions: ACT_CHECKLISTS.requete_injonction_payer.mentions.map((mention, i) => ({ mention, presente: i === 1 ? 'oui' : 'non', extrait: '', observation: 'à ajouter' })),
        autres: [], conclusion: '',
      }));
    const outcome: any = await skill.run(context);
    expect((context.llm.complete as jest.Mock).mock.calls[1][0]).toContain('AUPSRVE, art. 4');
    expect(outcome.markdown).toContain('4 mention(s) absente(s)');
  });
});

describe('Anonymisation', () => {
  it('remplace les mêmes données par les mêmes pseudonymes, e-mails et téléphones compris', () => {
    const { text, mapping } = anonymize(
      'Jean Dupont (jean.dupont@mail.cm, 677 12 34 56) a vendu à la SARL Alpha. M. Dupont réside à Bonapriso.',
      [{ valeur: 'Jean Dupont', type: 'personne' }, { valeur: 'SARL Alpha', type: 'societe' }, { valeur: 'Bonapriso', type: 'lieu' }],
    );
    expect(text).toBe('Personne A ([e-mail 1], [téléphone 1]) a vendu à la Société A. M. Personne A réside à [lieu 1].');
    expect(mapping.map((m) => m.original)).toContain('Jean Dupont');
  });
});

describe('Version bilingue', () => {
  it('découpe en paragraphes et détecte la langue source', () => {
    expect(splitParagraphs('Article 1\n\nLe preneur paie le loyer.\n\nArticle 2')).toHaveLength(3);
    expect(detectLanguage('Le preneur est tenu de payer le loyer dans les délais.')).toBe('fr');
    expect(detectLanguage('The lessee shall pay the rent within the time limits.')).toBe('en');
  });

  it('place chaque paragraphe et sa traduction côte à côte', async () => {
    const skill = new VersionBilingueSkill(targetsMock() as any);
    const context = ctx({ references: [], documents: [{ name: 'bail.docx', content: 'Le preneur paie le loyer.\n\nLe bail est conclu pour trois ans.' }] });
    (context.llm.complete as jest.Mock).mockResolvedValue('{"traductions": ["The lessee pays the rent.", "The lease is concluded for three years."]}');
    const outcome: any = await skill.run(context);
    expect(outcome.draft.template).toMatchObject({ code: 'skill_bilingue', orientation: 'landscape' });
    expect(outcome.draft.variables.bodyContent).toContain('<td style="text-align:left; vertical-align:top;">The lessee pays the rent.</td>');
  });
});

describe('Dossiers comparables', () => {
  it('classe par procédure, juridiction et objet commun', () => {
    const reference = { procedure_type_id: 3, jurisdiction_id: 7, object: 'Recouvrement de loyers impayés' } as any;
    expect(similarity(reference, { procedure_type_id: 3, jurisdiction_id: 7, object: 'Loyers impayés commerciaux' } as any))
      .toBeGreaterThan(similarity(reference, { procedure_type_id: 9, object: 'Divorce' } as any));
  });
});

describe('Mises en page PDF des compétences', () => {
  it('échappe le texte pour le moteur PDF et fournit le modèle intégré', () => {
    expect(pdfText('SARL <X> & fils')).toBe('SARL ‹X› &amp; fils');
    expect(htmlTable(['A'], [['<b>']])).toContain('‹b›');
    const draft = inlineDraft({ layout: 'skill_acte', name: 'Conclusions', title: 'Conclusions en réponse', info: dossierInfo(), sender: { name: 'Me Kaby', title: 'Avocat', cabinetName: 'Cabinet Kaby' } });
    expect(draft).toMatchObject({ templateCode: 'skill_acte', dossierId: 91, template: { title: 'CONCLUSIONS EN RÉPONSE', entity_type: 'general' } });
    expect(draft.variables.signatoryName).toBe('Me Kaby');
  });
});
