/// <reference types="jest" />
import { isSqlShownInChat, toChatPayload } from './chat-visibility';

describe('chat-visibility', () => {
  it('masque le SQL par défaut', () => {
    expect(isSqlShownInChat({})).toBe(false);
    expect(isSqlShownInChat({ AI_CHAT_SHOW_SQL: 'false' })).toBe(false);
    expect(isSqlShownInChat({ AI_CHAT_SHOW_SQL: 'true' })).toBe(true);
    expect(isSqlShownInChat({ AI_CHAT_SHOW_SQL: ' 1 ' })).toBe(true);
  });

  it('retire la requête et réduit les lignes quand le détail est masqué', () => {
    const rows = Array.from({ length: 30 }, (_, id) => ({ id, dossier_number: `DOS-${id}` }));
    const payload = toChatPayload(
      {
        analysis: 'Réponse',
        sqlQuery: 'SELECT * FROM dossiers',
        results: rows,
        rowCount: 30,
        resultSets: [{ title: 'Dossiers', sqlQuery: 'SELECT 1', data: rows, rowCount: 30 }],
      },
      false,
    ) as Record<string, any>;
    expect(payload.sqlQuery).toBeUndefined();
    expect(payload.resultSets).toBeUndefined();
    expect(payload.results).toHaveLength(20);
    expect(payload.rowCount).toBe(30);
    expect(payload.sources).toEqual([{ title: 'Dossiers', rowCount: 30 }]);
    expect(JSON.stringify(payload)).not.toContain('SELECT');
  });

  it("nettoie aussi les métadonnées d'un message d'historique", () => {
    const message = toChatPayload(
      { id: 1, role: 'assistant', content: 'Réponse', metadata: { sqlQuery: 'SELECT 1', results: [], rowCount: 0 } },
      false,
    ) as Record<string, any>;
    expect(message.content).toBe('Réponse');
    expect(message.metadata).toEqual({ results: [], rowCount: 0 });
    const serialized = toChatPayload({ metadata: JSON.stringify({ sqlQuery: 'SELECT 1' }) }, false) as Record<string, any>;
    expect(serialized.metadata).toEqual({});
  });

  it('laisse tout passer quand le détail est activé', () => {
    const payload = { sqlQuery: 'SELECT 1', results: [{ id: 1 }] };
    expect(toChatPayload(payload, true)).toBe(payload);
  });
});
