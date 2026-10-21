import { describe, expect, it, jest } from '@jest/globals';
import { BillingMode } from '../case-workflow/case-workflow.enums';
import {
  cleanProfileProposal,
  ConfigurerFacturationAiAction,
  ConfigurerFacturationSkill,
  DevisHonorairesSkill,
  parseAmount,
  proposalFromParams,
  quoteHtml,
  quoteLines,
  quoteTotals,
} from './billing.skills';

describe('compétences de facturation : proposition', () => {
  it('lit les montants saisis à la française', () => {
    expect(parseAmount('500 000 FCFA')).toBe(500000);
    expect(parseAmount('1 250,50')).toBe(1250.5);
    expect(parseAmount(75000)).toBe(75000);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('à convenir')).toBeNull();
  });

  it('borne le profil proposé (mode, montants positifs, taux ≤ 100, oui/non)', () => {
    expect(cleanProfileProposal({
      mode: 'forfait',
      fixed_fee: '500 000',
      hourly_rate: -10,
      result_fee_rate: 150,
      vat_rate: '19,25',
      opening_fee_enabled: 'oui',
      rebill_expenses: 'non',
      inconnu: 'x',
    })).toEqual({
      mode: BillingMode.FIXED,
      fixed_fee: 500000,
      result_fee_rate: 100,
      vat_rate: 19.25,
      opening_fee_enabled: true,
      rebill_expenses: false,
    });
  });

  it('déduit les lignes du devis du profil quand le modèle n’en donne pas', () => {
    const lines = quoteLines([], { fixed_fee: 500000, opening_fee: 50000, opening_fee_enabled: true });
    expect(lines.map((line) => line.label)).toEqual(["Frais d'ouverture du dossier", 'Honoraires forfaitaires']);
    expect(quoteTotals(lines, 19.25)).toEqual({ totalHt: 550000, vat: 105875, totalTtc: 655875 });
  });

  it('revalide une proposition reçue d’un bouton de suite', () => {
    const proposal = proposalFromParams({
      profile: { mode: 'MIXED', fixed_fee: 300000, result_fee_enabled: true, result_fee_rate: 10 },
      lines: [{ label: 'Forfait', quantity: 1, unit: 'forfait', unitPrice: 300000 }],
      vatRate: 19.25,
      validityDays: 30,
    })!;
    expect(proposal.profile).toMatchObject({ mode: BillingMode.MIXED, fixed_fee: 300000, result_fee_rate: 10 });
    expect(proposal.lines).toHaveLength(1);
    expect(proposalFromParams('nimporte')).toBeNull();
  });

  it('le devis échappe le texte (aucune balise injectée)', () => {
    const html = quoteHtml(
      { profile: { mode: BillingMode.FIXED, fixed_fee: 1000 }, lines: [{ label: '<script>x</script>', quantity: 1, unit: 'forfait', unitPrice: 1000 }], vatRate: 0, currency: 'FCFA', validityDays: 30, conditions: '', rationale: '', checks: [], sources: [] },
      { dossier: { id: 37, dossier_number: 'DOS-2026-0037', object: null }, client: { full_name: 'Jean DUPONT' } } as any,
      { name: 'Me Kamga', title: 'Avocat', cabinetName: 'Cabinet', cabinetAddress: '' },
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('‹script›');
    expect(html).toContain('DEVIS D');
    expect(html).toContain('Jean DUPONT');
  });

  it('applique une proposition reçue sans relancer l’IA (configuration → plan à confirmer)', async () => {
    const targets = { load: jest.fn(async () => ({ type: 'dossier', dossier: { id: 37, dossier_number: 'DOS-2026-0037' }, client: null })) };
    const skill = new ConfigurerFacturationSkill(targets as any, {} as any);
    const outcome: any = await skill.run({
      question: 'applique',
      references: [],
      params: {
        target: { type: 'dossier', id: 37, label: 'DOS-2026-0037' },
        proposal: { profile: { mode: 'FIXED', fixed_fee: 500000 }, lines: [], vatRate: 0 },
      },
      documents: [],
      history: [],
      llm: { complete: jest.fn(), stream: jest.fn() },
      status: jest.fn(),
    } as any);
    expect(outcome.type).toBe('plan');
    expect(outcome.plan.operations[0]).toMatchObject({ operation: 'ACTION', action: 'configurer_facturation', entity: 'dossiers', entityId: 37 });
    expect(outcome.plan.operations[0].fields).toEqual({ mode: 'FIXED', fixed_fee: '500000' });
    expect(outcome.followUps[0].skill).toBe('devis_honoraires');
  });

  it('le devis sans montant demande une précision', async () => {
    const targets = { load: jest.fn(async () => ({ type: 'dossier', dossier: { id: 37, dossier_number: 'DOS-2026-0037' }, client: null })), sender: jest.fn() };
    const skill = new DevisHonorairesSkill(targets as any, {} as any);
    const outcome: any = await skill.run({
      question: 'devis', references: [], documents: [], history: [], status: jest.fn(),
      params: { target: { type: 'dossier', id: 37, label: 'DOS-2026-0037' }, proposal: { profile: { mode: 'FIXED' }, lines: [] } },
    } as any);
    expect(outcome.type).toBe('clarify');
  });
});

describe('action « configurer_facturation »', () => {
  function build(profile: any = { mode: 'FIXED', fixed_fee: 100000, lock_version: 3 }) {
    const billing = {
      updateProfile: jest.fn(async () => ({
        mode: 'MIXED',
        billing_sync: { updated_items: ['Forfait'], created_items: [], updated_invoices: [{ numero: 'FAC-2026-0040' }], locked_invoices: [], needs_review: [], recalculable_items: 0 },
      })),
    };
    const dataSource = { getRepository: () => ({ findOne: jest.fn(async () => profile) }) };
    return { action: new ConfigurerFacturationAiAction(billing as any, dataSource as any), billing };
  }

  it('applique les champs de la carte avec la version du profil, par le service de l’onglet Facturation', async () => {
    const { action, billing } = build();
    const prepared = await action.prepare(37, { mode: 'MIXED', fixed_fee: '300 000', result_fee_enabled: 'oui', result_fee_rate: '10' }, '31');
    expect(billing.updateProfile).not.toHaveBeenCalled();
    const message = await prepared.run();
    expect(billing.updateProfile).toHaveBeenCalledWith(37, {
      mode: BillingMode.MIXED, fixed_fee: 300000, result_fee_enabled: true, result_fee_rate: 10, expected_version: 3,
    }, 31);
    expect(message).toContain('FAC-2026-0040');
  });

  it('refuse une carte vide', async () => {
    const { action } = build();
    await expect(action.prepare(37, { inconnu: 'x' }, '31')).rejects.toThrow('Aucun champ');
  });

  it('propose les modes et les choix oui/non sur la carte', async () => {
    const { action } = build();
    const options = await action.paramOptions();
    expect(options.mode.map((item) => item.value)).toEqual(['FIXED', 'HOURLY', 'PERCENTAGE', 'MIXED']);
    expect(options.result_fee_enabled).toEqual([{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]);
  });
});
