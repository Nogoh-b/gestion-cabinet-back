import { readMemory, renderWorkingContext, turnSubjects, updateMemory, type ResolvedReference } from './agent-memory';
import type { AgentStep } from './agent-loop';

const step = (name: string, args: Record<string, any>, result: Record<string, any>): AgentStep => ({ name, args, result });

describe('mémoire de travail de l’agent', () => {
  it('la synthèse d’un dossier en fait le dossier et le client en cours', () => {
    const memory = updateMemory(undefined, [], [
      step('synthese_dossier', { dossier: 'DOS-7-0001' }, {
        identite: { dossier_number: 'DOS-7-0001', client: 'Société Éléphant SARL', code_client: 'CLI-7-002' },
      }),
    ]);
    expect(memory).toEqual({
      dossier: { numero: 'DOS-7-0001', client: 'Société Éléphant SARL' },
      client: { nom: 'Société Éléphant SARL', code: 'CLI-7-002' },
    });
  });

  it('retient la dernière liste, dans l’ordre (« la deuxième »)', () => {
    const memory = updateMemory(undefined, [], [
      step('factures', { filtre: 'non_soldees' }, { lignes: [{ numero: 'FAC-1' }, { numero: 'FAC-2' }, { numero: 'FAC-3' }] }),
    ]);
    expect(memory.liste).toEqual({ type: 'factures', elements: ['FAC-1', 'FAC-2', 'FAC-3'] });
    expect(renderWorkingContext([], memory)).toContain('Dernière liste affichée (factures) : 1. FAC-1, 2. FAC-2, 3. FAC-3');
  });

  it('une seule facture lue devient « cette facture » ; un filtre client devient le client en cours', () => {
    const memory = updateMemory(undefined, [], [
      step('factures', { client: 'Mballa' }, { lignes: [{ numero: 'FAC-7-0005', dossier: 'DOS-7-0003', client: 'Jean Mballa' }] }),
    ]);
    expect(memory.facture).toEqual({ numero: 'FAC-7-0005', dossier: 'DOS-7-0003' });
    expect(memory.client).toEqual({ nom: 'Jean Mballa' });
  });

  it('un collaborateur mentionné (@) ou seul lu devient « le », « lui » du tour suivant', () => {
    const mention: ResolvedReference = { type: 'collaborateur', source: 'mention', reference: 'Nogoh Brice', details: 'Avocat' };
    const memory = updateMemory({ dossier: { numero: 'DOS-2026-0002' } }, [mention], []);
    expect(memory.collaborateur).toEqual({ nom: 'Nogoh Brice' });
    // Le dossier en cours reste : un collaborateur ne le remplace pas.
    expect(memory.dossier).toEqual({ numero: 'DOS-2026-0002' });
    const context = renderWorkingContext([mention], memory);
    expect(context).toContain("Mentionné par l'utilisateur (@) : collaborateur Nogoh Brice (Avocat)");
    expect(context).toContain('Collaborateur en cours : Nogoh Brice');
    expect(readMemory(JSON.parse(JSON.stringify(memory)))).toEqual(memory);

    const read = updateMemory(undefined, [], [step('equipe', { texte: 'Ekane' }, { lignes: [{ collaborateur: 'Paul Ekane', fonction: 'Avocat' }] })]);
    expect(read.collaborateur).toEqual({ nom: 'Paul Ekane' });
    const team = updateMemory(undefined, [], [step('equipe', {}, { lignes: [{ collaborateur: 'A' }, { collaborateur: 'B' }] })]);
    expect(team.collaborateur).toBeUndefined();
    expect(team.liste).toEqual({ type: 'collaborateurs', elements: ['A', 'B'] });
  });

  it('une erreur ou un « introuvable » ne change pas le sujet', () => {
    const previous = { dossier: { numero: 'DOS-7-0001' } };
    expect(updateMemory(previous, [], [step('synthese_dossier', { dossier: 'DOS-9' }, { introuvable: 'aucun dossier' })])).toEqual(previous);
    expect(updateMemory(previous, [], [step('factures', { dossier: 'DOS-9' }, { erreur: 'consultation impossible' })])).toEqual(previous);
  });

  it('une recherche à résultat unique fixe le sujet ; plusieurs homonymes non', () => {
    const one = updateMemory(undefined, [], [
      step('chercher', { texte: 'Nkodo' }, { dossiers: [{ dossier_number: 'DOS-7-0004', client: 'Alice Nkodo' }], clients: [{ client: 'Alice Nkodo' }], factures: [] }),
    ]);
    expect(one.dossier?.numero).toBe('DOS-7-0004');
    const two = updateMemory(undefined, [], [
      step('chercher', { texte: 'Mballa' }, { dossiers: [{ dossier_number: 'DOS-7-0003' }, { dossier_number: 'DOS-7-0006' }], clients: [{ client: 'Jean Mballa' }, { client: 'Paul Mballa' }], factures: [] }),
    ]);
    expect(two.dossier).toBeUndefined();
    expect(two.client).toBeUndefined();
  });

  it('les références jointes (@, fiche ouverte) priment et sont présentées en numéros métier', () => {
    const references: ResolvedReference[] = [
      { type: 'facture', source: 'page', reference: 'FAC-7-0001', dossier: 'DOS-7-0001', client: 'Société Éléphant SARL', details: 'dossier DOS-7-0001, client Société Éléphant SARL' },
      { type: 'dossier', source: 'mention', reference: 'DOS-7-0003', client: 'Jean Mballa', details: 'client Jean Mballa' },
    ];
    const memory = updateMemory({ dossier: { numero: 'DOS-7-0002' } }, references, []);
    expect(memory.facture).toEqual({ numero: 'FAC-7-0001', dossier: 'DOS-7-0001' });
    // La mention @ du dossier l'emporte sur le dossier de la facture ouverte.
    expect(memory.dossier?.numero).toBe('DOS-7-0003');
    expect(updateMemory(undefined, [references[0]], []).dossier?.numero).toBe('DOS-7-0001');
    const context = renderWorkingContext(references, memory);
    expect(context).toContain("Mentionné par l'utilisateur (@) : dossier DOS-7-0003 (client Jean Mballa)");
    expect(context).toContain("Fiche ouverte à l'écran : facture FAC-7-0001");
    expect(context).toContain('facture FAC-7-0001 (dossier DOS-7-0001, client Société Éléphant SARL)');
    expect(context).not.toMatch(/id=/);
  });

  it('relit une mémoire enregistrée, en ignorant ce qui est malformé', () => {
    expect(readMemory({ dossier: { numero: 'DOS-1', client: 'X' }, liste: { type: 'factures', elements: ['F-1', 2, null] }, autre: 1 })).toEqual({
      dossier: { numero: 'DOS-1', client: 'X' },
      liste: { type: 'factures', elements: ['F-1', '2'] },
    });
    expect(readMemory(null)).toBeUndefined();
    expect(readMemory({ dossier: {} })).toBeUndefined();
    expect(renderWorkingContext([], undefined)).toBe('');
  });
});

describe('fiches citées par un tour de l’agent', () => {
  it('le sujet d’abord (dossier, client), puis les premiers éléments des listes', () => {
    const subjects = turnSubjects([], [
      step('synthese_dossier', { dossier: 'DOS-7-0001' }, {
        identite: { dossier_number: 'DOS-7-0001', client: 'Société Éléphant SARL', code_client: 'CLI-7-002' },
      }),
      step('factures', { filtre: 'en_retard' }, { lignes: [{ numero: 'FAC-1' }, { numero: 'FAC-2' }, { numero: 'FAC-3' }, { numero: 'FAC-4' }] }),
    ]);
    expect(subjects).toEqual([
      { type: 'dossier', reference: 'DOS-7-0001' },
      { type: 'client', reference: 'CLI-7-002' },
      { type: 'facture', reference: 'FAC-1' },
      { type: 'facture', reference: 'FAC-2' },
      { type: 'facture', reference: 'FAC-3' },
    ]);
  });

  it('« qui nous doit le plus » : le client débiteur ; le point du jour : ses fiches urgentes', () => {
    expect(turnSubjects([], [step('debiteurs', {}, { lignes: [{ client: 'Société Éléphant SARL', code_client: 'CLI-7-002' }] })]))
      .toEqual([{ type: 'client', reference: 'CLI-7-002' }, { type: 'client', reference: 'Société Éléphant SARL' }]);
    expect(turnSubjects([], [step('point_du_jour', {}, {
      audiences_a_venir: { lignes: [{ dossier: 'DOS-7-0002' }] },
      actions_en_retard: { lignes: [{ dossier: 'DOS-7-0001' }, { dossier: 'DOS-7-0002' }] },
      factures_a_relancer: { lignes: [{ numero: 'FAC-7-0001' }] },
    })])).toEqual([
      { type: 'dossier', reference: 'DOS-7-0002' },
      { type: 'dossier', reference: 'DOS-7-0001' },
      { type: 'facture', reference: 'FAC-7-0001' },
    ]);
  });

  it('ne reprend pas les sujets des tours précédents ; une erreur ne cite rien', () => {
    expect(turnSubjects([], [step('factures', { dossier: 'DOS-9' }, { erreur: 'consultation impossible' })])).toEqual([]);
  });
});
