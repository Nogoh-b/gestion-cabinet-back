/// <reference types="jest" />
import {
  citedRecordsFromLinks,
  formatHistoryForPlanner,
  historyHasCitedRecords,
  knownRecordKeys,
  recordFromHref,
  toCitedReference,
  unverifiedTargets,
} from './cited-records';
import { extractDisplayedRecords } from './displayed-records';
import { parseVisibleHistory } from './dto/ask-question.dto';

describe('Enregistrements cités par le chat', () => {
  it('donne à chaque enregistrement lu son identifiant, son libellé métier et son lien', () => {
    const { records } = extractDisplayedRecords([
      { ref__dossiers: 91, numero_dossier: 'DOS-2026-0001', objet: 'Bail', statut: 'Ouvert' },
      { ref__customer: 12, nom_complet: 'Jean Dupont', code_client: 'CLI-0004' },
    ]);
    expect(records.map(toCitedReference)).toEqual([
      { type: 'dossier', entity: 'dossiers', id: 91, label: 'DOS-2026-0001', href: '/dossiers/91' },
      { type: 'client', entity: 'customer', id: 12, label: 'Jean Dupont', href: '/clients/12' },
    ]);
  });

  it('retrouve table et identifiant depuis les liens des fiches', () => {
    expect(recordFromHref('/dossiers/94')).toEqual({ entity: 'dossiers', id: 94 });
    expect(recordFromHref('/dossiers/diligences/7')).toEqual({ entity: 'diligences', id: 7 });
    expect(recordFromHref('/clients/12?tab=docs')).toEqual({ entity: 'customer', id: 12 });
    expect(recordFromHref('/parametres')).toBeNull();
    expect(citedRecordsFromLinks('- Dossiers [DOS-2026-0004 — Bail \\[2\\]](/dossiers/94) · Client [Jean](/clients/3)')).toEqual([
      { entity: 'dossiers', id: 94, label: 'DOS-2026-0004 — Bail [2]' },
      { entity: 'customer', id: 3, label: 'Jean' },
    ]);
  });

  it('écrit les identifiants cités sous chaque message pour le planificateur', () => {
    const history = parseVisibleHistory(JSON.stringify([
      { role: 'user', content: 'liste mes dossiers ouverts' },
      {
        role: 'assistant',
        content: 'Vous avez 2 dossiers ouverts : DOS-2026-0001 et DOS-2026-0002.',
        refs: [
          { entity: 'dossiers', type: 'dossier', id: 91, label: 'DOS-2026-0001' },
          { entity: 'dossiers', id: 92, label: 'DOS-2026-0002' },
          { entity: 'dossiers; DROP', id: 1 },
          { entity: 'dossiers', id: '1 OR 1=1' },
        ],
      },
    ]));
    expect(history[1].refs).toHaveLength(2);
    const text = formatHistoryForPlanner(history);
    expect(text).toContain('ASSISTANT: Vous avez 2 dossiers ouverts');
    expect(text).toContain('[Enregistrements cités (table#id) : dossiers#91 « DOS-2026-0001 » ; dossiers#92 « DOS-2026-0002 »]');
    expect(historyHasCitedRecords(history)).toBe(true);
  });

  it('garde les échanges les plus récents quand l’historique est trop long', () => {
    const history = [
      { role: 'user' as const, content: 'A'.repeat(900) },
      { role: 'assistant' as const, content: 'B'.repeat(900) },
      { role: 'user' as const, content: 'dernière question' },
    ];
    const text = formatHistoryForPlanner(history, { maxChars: 1000 });
    expect(text).toContain('dernière question');
    expect(text).not.toContain('AAAA');
  });

  it('signale une cible que l’utilisateur n’a jamais vue', () => {
    const history = parseVisibleHistory(JSON.stringify([
      { role: 'assistant', content: 'ok', refs: [{ entity: 'dossiers', id: 91 }] },
    ]));
    const known = knownRecordKeys(history, [{ type: 'client', id: 12 }]);
    const ops = [
      { operation: 'UPDATE', entity: 'dossiers', entityId: 91 },
      { operation: 'UPDATE', entity: 'customer', entityId: 12 },
      { operation: 'DELETE', entity: 'audiences', entityId: 5 },
      { operation: 'UPDATE', entity: 'audiences', entityId: 44 },
      { operation: 'INSERT', entity: 'audiences', entityId: 99 },
    ];
    expect(unverifiedTargets(ops, known, 'supprime l’audience 44')).toEqual(['audiences#5']);
  });
});
