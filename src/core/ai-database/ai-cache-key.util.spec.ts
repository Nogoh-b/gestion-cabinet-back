import { buildAiCacheKey } from './ai-cache-key.util';

describe('buildAiCacheKey', () => {
  it('normalizes object key order and whitespace', () => {
    const first = buildAiCacheKey('sql', {
      tenant: 4,
      question: '  Liste   les dossiers ',
      tables: ['dossiers', 'customer'],
    });
    const second = buildAiCacheKey('sql', {
      tables: ['dossiers', 'customer'],
      question: 'liste les dossiers',
      tenant: 4,
    });

    expect(first).toBe(second);
  });
});
