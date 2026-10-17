import {
  parseReferenceAiReply,
  referenceJsonModeUnsupported,
  referenceReplyFallback,
} from './reference-ai-reply';

const change = {
  kind: 'settings',
  key: 'app_locale',
  values: { app_locale: 'en' },
};

describe('Reference assistant reply decoding', () => {
  it('accepts fenced JSON with introductory text and preserves escaped template content', () => {
    const html =
      '<p title="Exemple">{{client.nom}} \\ {{cabinetName}}</p>\n<p>Bonjour</p>';
    const reply = {
      answer: 'Voici le modèle.',
      changes: [
        { kind: 'mail_templates', key: 'EXEMPLE', values: { body_html: html } },
      ],
    };
    const raw =
      '\uFEFF  <think>Réflexion privée {"answer":"À ignorer"}</think>Voici ma proposition :\n```JSON\n' +
      JSON.stringify(reply) +
      '\n```\nÀ vérifier avant publication.';
    const result = parseReferenceAiReply(raw);
    expect(result?.answer).toBe(reply.answer);
    expect(result?.changes[0].values.body_html).toBe(html);
  });

  it('joins split text blocks without injecting newlines and ignores reasoning', () => {
    const text = JSON.stringify({
      answer: 'Choisissez votre langue.',
      changes: [change],
    });
    const split = text.indexOf('votre') + 2;
    const result = parseReferenceAiReply([
      { type: 'reasoning', text: '{"answer":"Réflexion privée"}' },
      { type: 'text', text: text.slice(0, split) },
      { type: 'output_text', text: text.slice(split) },
    ]);
    expect(result?.answer).toBe('Choisissez votre langue.');
    expect(result?.changes).toEqual([change]);
  });

  it('accepts explanations and clarification questions without a changes field', () => {
    expect(
      parseReferenceAiReply(
        '{"answer":"Le franc CFA reste adapté au cabinet."}',
      ),
    ).toMatchObject({
      changes: [],
      warnings: [],
      references: [],
      suggestions: [],
    });
    expect(
      parseReferenceAiReply(
        '{"clarifying_question":"Quelle langue souhaitez-vous utiliser ?"}',
      ),
    ).toMatchObject({
      answer: 'J’ai besoin d’une précision pour continuer.',
      changes: [],
      clarifying_question: 'Quelle langue souhaitez-vous utiliser ?',
    });
  });

  it('accepts object content and a gateway that encodes the answer twice', () => {
    const reply = { answer: 'Passez en anglais.', changes: [change] };
    expect(parseReferenceAiReply(reply)?.changes).toEqual([change]);
    expect(
      parseReferenceAiReply(JSON.stringify(JSON.stringify(reply)))?.changes,
    ).toEqual([change]);
  });

  it.each([
    '{"answer":"Avant","changes":[{"answer":"Un objet imbriqué ne constitue pas une réponse"}',
    '{"answer":"Un"}\n{"answer":"Deux","changes":[]}',
    '{"answer":"Un"}\n{"answer":"Incomplet',
    '[{"answer":"Un"}]',
    '<think>Raisonnement non terminé {"answer":"Ne pas afficher","changes":[]}',
    JSON.stringify({ answer: 'Proposition', changes: { app_locale: 'en' } }),
    JSON.stringify({
      answer: 'Proposition',
      changes: [{ ...change, active: 'oui' }],
    }),
    JSON.stringify({ answer: 'Proposition', changes: Array(31).fill(change) }),
  ])(
    'requires regeneration for ambiguous, incomplete or invalid changes: %s',
    (raw) => {
      expect(parseReferenceAiReply(raw)).toBeNull();
    },
  );

  it('rejects responses stopped by the token limit, even with a complete JSON prefix', () => {
    expect(
      parseReferenceAiReply(
        JSON.stringify({ answer: 'Incomplet', changes: [change] }),
        true,
      ),
    ).toBeNull();
  });

  it('never exposes incomplete JSON or hidden reasoning in the conversational fallback', () => {
    const fallback = referenceReplyFallback(
      '<think>Réflexion privée</think>{"answer":"Incomplet","changes":[',
    );
    expect(fallback).toBeNull();
    expect(referenceReplyFallback('Une réponse interrompue', true)).toBeNull();
    expect(
      referenceReplyFallback(
        '<think>Réflexion privée</think>Souhaitez-vous conserver le franc CFA ?',
      )?.answer,
    ).toBe(
      'Souhaitez-vous conserver le franc CFA ?\n\nAucune modification n’a été préparée ni appliquée.',
    );
  });

  it('only falls back from JSON mode when the gateway explicitly rejects that option', () => {
    expect(
      referenceJsonModeUnsupported({
        status: 400,
        message: 'response_format json_object is not supported',
      }),
    ).toBe(true);
    expect(
      referenceJsonModeUnsupported({
        status: 401,
        message: 'response_format not supported',
      }),
    ).toBe(false);
    expect(
      referenceJsonModeUnsupported({
        status: 500,
        message: 'response_format not supported',
      }),
    ).toBe(false);
    expect(
      referenceJsonModeUnsupported({
        status: 400,
        message: 'Unsupported model',
      }),
    ).toBe(false);
  });
});
