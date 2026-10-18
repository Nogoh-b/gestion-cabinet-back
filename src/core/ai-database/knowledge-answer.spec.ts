import {
  buildKnowledgeMessages,
  buildKnowledgeSystemPrompt,
  hasKnowledgeSources,
  relevantLegalMatches,
} from './knowledge-answer';

describe('Mode base de connaissance', () => {
  it('joint les extraits juridiques comme sources citables', () => {
    const prompt = buildKnowledgeSystemPrompt({
      legal: '[SOURCE JURIDIQUE 1 — AUDCG.pdf]\nLe délai est de trois mois.',
    });
    expect(prompt).toContain('MODE BASE DE CONNAISSANCE');
    expect(prompt).toContain('AUDCG.pdf');
    expect(prompt).not.toContain('AUCUN EXTRAIT');
  });

  it('signale une base vide au lieu de laisser croire à une source', () => {
    const sources = { legal: '  ' };
    expect(hasKnowledgeSources(sources)).toBe(false);
    expect(buildKnowledgeSystemPrompt(sources)).toContain('AUCUN EXTRAIT');
  });

  it('garde la persona du projet et un historique court', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: (index % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `message ${index}`,
    }));
    const messages = buildKnowledgeMessages(
      'Quel est le délai ?',
      { legal: '[SOURCE JURIDIQUE 1 — AUDCG.pdf]\nTrois mois.' },
      history,
      'Tu es juriste.',
    );
    expect(messages[0].content.startsWith('Tu es juriste.')).toBe(true);
    expect(messages).toHaveLength(1 + 6 + 1);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Quel est le délai ?' });
  });

  it('écarte un extrait qui ne partage qu’un mot isolé avec la question', () => {
    const match = (document_name: string, coverage: number) => ({
      document_id: document_name,
      document_name,
      chunk: '…',
      score: coverage * 10,
      coverage,
      matched_terms: 1,
    });
    expect(
      relevantLegalMatches([match('arrima.pdf', 0.25), match('AUPSRVE.pdf', 0.5)]).map(
        (item) => item.document_name,
      ),
    ).toEqual(['AUPSRVE.pdf']);
  });
});
