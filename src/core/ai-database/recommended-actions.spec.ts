import { describe, expect, it } from '@jest/globals';
import type { AiSkillCatalogItem } from './skills/ai-skill.types';
import {
  actionRecords,
  buildActionCandidates,
  buildActionsPrompt,
  defaultActions,
  parseChosenActions,
  type ActionContext,
} from './recommended-actions';

const skill = (code: string, targets: string[] = []): AiSkillCatalogItem => ({
  code,
  label: code,
  description: '',
  icon: 'zap',
  category: 'communication',
  categoryLabel: '',
  targets: targets as any,
  targetRequired: false,
  placeholder: '',
  examples: [],
  keywords: [],
});

const catalog = [
  skill('message_portail', ['client', 'dossier', 'facture', 'audience']),
  skill('envoyer_email', ['client', 'dossier', 'audience', 'facture']),
  skill('creer_diligence', ['dossier', 'employee']),
  skill('enregistrer_paiement', ['facture']),
  skill('envoyer_facture', ['facture']),
  skill('etat_impayes', ['client', 'dossier']),
  skill('rapport_activite'),
  skill('relancer_impayes', ['dossier']),
];

const dossier = { type: 'dossier' as const, id: 37, label: 'DOS-2026-0037', href: '/dossiers/37' };

function ctx(over: Partial<ActionContext> = {}): ActionContext {
  return {
    question: "demande au client de DOS-2026-0037 de déposer sa pièce d'identité",
    answer: "Le dossier DOS-2026-0037 de Jean DUPONT est ouvert et une pièce d'identité est attendue.",
    mode: 'read',
    outcome: 'answer',
    records: [dossier],
    followUps: [],
    catalog,
    ...over,
  };
}

describe('actions recommandées', () => {
  it('ne garde que les fiches des types connus, sans doublon', () => {
    expect(actionRecords([
      { type: 'dossiers', id: 37, label: 'DOS-2026-0037' },
      { entity: 'dossiers', id: 37, label: 'DOS-2026-0037' },
      { type: 'paiements', id: 4, label: 'P-4' },
      { type: 'factures', id: 'uuid-40', label: 'FAC-2026-0040' },
    ])).toEqual([
      { type: 'dossier', id: 37, label: 'DOS-2026-0037' },
      { type: 'facture', id: 'uuid-40', label: 'FAC-2026-0040' },
    ]);
  });

  it('propose d’abord l’espace client pour une fiche dossier, avec sa cible', () => {
    const [first] = buildActionCandidates(ctx());
    expect(first.skill).toBe('message_portail');
    expect(first.skillParams).toEqual({ target: { type: 'dossier', id: 37, label: 'DOS-2026-0037', href: '/dossiers/37' } });
    expect(first.references?.[0].id).toBe(37);
  });

  it('ne repropose pas la compétence qui vient de répondre', () => {
    const codes = buildActionCandidates(ctx({ skill: 'message_portail' })).map((item) => item.skill);
    expect(codes).not.toContain('message_portail');
  });

  it('place les suites prévues par la compétence en tête', () => {
    const [first] = buildActionCandidates(ctx({
      followUps: [{ label: 'Relancer DOS-2026-0037', skill: 'relancer_impayes', question: 'Relance le client pour les impayés du dossier DOS-2026-0037.', params: { target: { type: 'dossier', id: 37 } } }],
    }));
    expect(first.label).toBe('Relancer DOS-2026-0037');
  });

  it('après un paiement refusé, propose la compétence « Enregistrer un paiement »', () => {
    const [first] = buildActionCandidates(ctx({
      question: '1000 FCFA reçus par virement aujourd’hui sur FAC-2026-0040',
      answer: '❌ Échec du plan d’écriture: Validation échouée pour paiements',
      mode: 'write',
      outcome: 'write_failed',
      records: [{ type: 'facture', id: 'uuid-40', label: 'FAC-2026-0040' }],
    }));
    expect(first.skill).toBe('enregistrer_paiement');
    expect(first.prompt).toContain('1000 FCFA');
    expect(first.skillParams).toEqual({ target: { type: 'facture', id: 'uuid-40', label: 'FAC-2026-0040' } });
  });

  it('sans fiche, propose les actions du cabinet (y compris en mode Aide)', () => {
    const candidates = buildActionCandidates(ctx({ records: [], mode: 'help', question: 'comment fonctionne la facturation ?' }));
    expect(candidates.map((item) => item.skill ?? item.kind)).toEqual(expect.arrayContaining(['etat_impayes', 'rapport_activite', 'read']));
  });

  it('une compétence absente du catalogue (droits, plan) n’est jamais proposée', () => {
    const codes = buildActionCandidates(ctx({ catalog: catalog.filter((item) => item.code !== 'message_portail') })).map((item) => item.skill);
    expect(codes).not.toContain('message_portail');
  });

  it('garde les choix du modèle, réécrits, et refuse les compétences inventées', () => {
    const candidates = buildActionCandidates(ctx());
    const portal = candidates.find((item) => item.skill === 'message_portail')!;
    const actions = parseChosenActions(JSON.stringify({
      actions: [
        { id: portal.id, label: "Demander la pièce d'identité à Jean DUPONT", prompt: "Demande au client du dossier DOS-2026-0037 de déposer sa pièce d'identité dans son espace client." },
        { id: 'c99', label: 'Inventée', prompt: 'Compétence inventée' },
        { kind: 'read', label: 'Voir les pièces reçues', prompt: 'Liste les documents du dossier DOS-2026-0037 reçus ce mois.' },
        { kind: 'write', label: 'Autre dossier', prompt: 'Clôture le dossier DOS-2026-0099.' },
      ],
    }), candidates, ctx())!;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ skill: 'message_portail', label: "Demander la pièce d'identité à Jean DUPONT", priority: 1 });
    expect(actions[0].skillParams).toEqual(portal.skillParams);
    expect(actions[1]).toMatchObject({ kind: 'read', intentMode: 'read', priority: 2 });
    expect(actions[1].references?.[0].id).toBe(37);
  });

  it('retombe sur les libellés par défaut si le modèle répond mal', () => {
    const candidates = buildActionCandidates(ctx());
    expect(parseChosenActions('pas de JSON', candidates, ctx())).toBeNull();
    const fallback = defaultActions(candidates);
    expect(fallback).toHaveLength(3);
    expect(fallback.map((item) => item.priority)).toEqual([1, 2, 3]);
  });

  it('le prompt liste les candidats et dit ce que la carte propose déjà', () => {
    const prompt = buildActionsPrompt(ctx({ outcome: 'message_draft' }), buildActionCandidates(ctx()));
    expect(prompt).toContain('[c1]');
    expect(prompt).toContain('Ouvrir WhatsApp');
  });
});
