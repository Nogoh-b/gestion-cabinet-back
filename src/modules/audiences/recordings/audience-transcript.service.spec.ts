import { describe, expect, it, jest } from '@jest/globals';

import { TenantContext } from 'src/core/tenant/tenant.context';
import { AudienceRecording, RecordingTranscriptStatus } from './audience-recording.entity';
import {
  assembleTranscript,
  AudienceTranscriptService,
  boundTranscript,
  clockLabel,
  transcriptFacts,
} from './audience-transcript.service';

const { DONE, EMPTY, FAILED, PENDING } = RecordingTranscriptStatus;

let nextId = 1;
function segment(overrides: Partial<AudienceRecording> = {}): AudienceRecording {
  const id = nextId++;
  return Object.assign(new AudienceRecording(), {
    id,
    session_id: 'sess_a',
    segment_index: 0,
    duration_seconds: 300,
    transcript: null,
    transcript_status: DONE,
    created_at: new Date(Date.UTC(2026, 9, 29, 8, 0, id)),
    ...overrides,
  });
}

describe('assembleTranscript', () => {
  it('remet les segments dans l’ordre et poursuit la prise de parole d’un segment à l’autre', () => {
    const rows = [
      // Reçus dans le désordre : le rang du segment fait foi.
      segment({ segment_index: 1, transcript: 'qu’il plaise au tribunal de renvoyer.\nIntervenant 2 : Accordé.' }),
      segment({ segment_index: 0, transcript: 'Intervenant 1 : Monsieur le Président, nous demandons\nqu’il soit dit' }),
    ];
    const result = assembleTranscript(rows);
    expect(result.text).toBe(
      'Intervenant 1 : Monsieur le Président, nous demandons qu’il soit dit qu’il plaise au tribunal de renvoyer.\n\nIntervenant 2 : Accordé.',
    );
    expect(result).toMatchObject({ segments: 2, transcribed: 2, missing: [], speakers: 2, sessions: 1, durationSeconds: 600 });
  });

  it('fusionne le même intervenant de part et d’autre de la coupure', () => {
    const result = assembleTranscript([
      segment({ segment_index: 0, transcript: 'Intervenant 1 : Je commence.' }),
      segment({ segment_index: 1, transcript: 'Intervenant 1 : et je termine.\nIntervenant 2 : Merci.' }),
    ]);
    expect(result.text).toBe('Intervenant 1 : Je commence. et je termine.\n\nIntervenant 2 : Merci.');
  });

  it('signale les segments non transcrits à leur place, avec les heures, sans continuité supposée', () => {
    const result = assembleTranscript([
      segment({ segment_index: 0, transcript: 'Intervenant 1 : Début.' }),
      segment({ segment_index: 1, transcript: null, transcript_status: FAILED }),
      segment({ segment_index: 2, transcript: 'suite après la coupure [inaudible].' }),
      segment({ segment_index: 3, transcript: null, transcript_status: PENDING, duration_seconds: 120 }),
    ]);
    expect(result.text).toBe([
      'Intervenant 1 : Début.',
      '[Segment 2 (05:00 – 10:00) : transcription échouée — contenu manquant]',
      'suite après la coupure [inaudible].',
      '[Segment 4 (15:00 – 17:00) : transcription en attente — contenu manquant]',
    ].join('\n\n'));
    expect(result.missing.map((item) => [item.segment, item.from, item.to, item.label])).toEqual([
      [2, 300, 600, 'transcription échouée'],
      [4, 900, 1020, 'transcription en attente'],
    ]);
    expect(result.transcribed).toBe(2);
    expect(result.inaudible).toBe(1);
  });

  it('un silence (aucune parole) coupe le fil sans être signalé comme manquant', () => {
    const result = assembleTranscript([
      segment({ segment_index: 0, transcript: 'Intervenant 1 : Avant la suspension.' }),
      segment({ segment_index: 1, transcript: null, transcript_status: EMPTY }),
      segment({ segment_index: 2, transcript: 'Reprise.' }),
    ]);
    expect(result.text).toBe('Intervenant 1 : Avant la suspension.\n\nReprise.');
    expect(result.empty).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it('sépare les enregistrements, dans l’ordre où ils ont commencé', () => {
    const result = assembleTranscript([
      segment({ session_id: 'apres', created_at: new Date('2026-10-29T10:00:00Z'), transcript: 'Intervenant 1 : Seconde partie.' }),
      segment({ session_id: 'avant', created_at: new Date('2026-10-29T09:00:00Z'), transcript: 'Intervenant 1 : Première partie.' }),
    ]);
    expect(result.sessions).toBe(2);
    expect(result.text).toBe('— Enregistrement 1 —\n\nIntervenant 1 : Première partie.\n\n— Enregistrement 2 —\n\nIntervenant 1 : Seconde partie.');
  });

  it('durée inconnue : pas d’heures dans le repère', () => {
    const result = assembleTranscript([segment({ duration_seconds: null, transcript_status: null })]);
    expect(result.text).toBe('[Segment 1 : non transcrit — contenu manquant]');
  });
});

describe('boundTranscript / transcriptFacts', () => {
  it('garde un texte court tel quel', () => {
    expect(boundTranscript('Intervenant 1 : Oui.', 100)).toEqual({ text: 'Intervenant 1 : Oui.', truncated: false });
  });

  it('borne un texte long : début, extraits et fin, coupures marquées', () => {
    const long = Array.from({ length: 400 }, (_, i) => `Intervenant ${(i % 2) + 1} : réplique numéro ${i} avec un peu de texte.`).join('\n\n');
    const { text, truncated } = boundTranscript(long, 4000);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.startsWith('Intervenant 1 : réplique numéro 0 ')).toBe(true);
    expect(text).toContain('réplique numéro 399');
    expect(text).toContain('caractères non repris');
    expect(text.match(/caractères non repris/g)?.length).toBe(3);
  });

  it('annonce segments manquants, passages inaudibles et troncature', () => {
    const assembled = assembleTranscript([
      segment({ segment_index: 0, transcript: `Intervenant 1 : ${'mot '.repeat(2000)}[inaudible]` }),
      segment({ segment_index: 1, transcript_status: FAILED }),
    ]);
    const facts = transcriptFacts(assembled, 3000);
    expect(facts).toContain('1 segment(s) transcrit(s) sur 2');
    expect(facts).toContain('SEGMENTS NON TRANSCRITS');
    expect(facts).toContain('segment 2 (05:00 – 10:00) — transcription échouée');
    expect(facts).toContain('1 passage(s) marqué(s) [inaudible]');
    expect(facts).toContain('TRANSCRIPTION TRONQUÉE');
  });

  it('rien sans enregistrement ; message explicite si aucun segment n’est transcrit', () => {
    expect(transcriptFacts(assembleTranscript([]))).toBe('');
    expect(transcriptFacts(assembleTranscript([segment({ transcript_status: PENDING })]))).toContain('aucune parole transcrite');
  });

  it('clockLabel', () => {
    expect(clockLabel(65)).toBe('01:05');
    expect(clockLabel(3725)).toBe('1:02:05');
  });
});

describe('AudienceTranscriptService', () => {
  it('lit les segments de l’audience dans le cabinet courant', async () => {
    const find = jest.fn(async (_options: any) => [segment({ transcript: 'Intervenant 1 : Bonjour.' })]);
    const service = new AudienceTranscriptService({ getRepository: () => ({ find }) } as any);
    const result = await new TenantContext().run(4242, () => service.assemble(7));
    expect(find.mock.calls[0][0].where).toMatchObject({ tenant_id: 4242, audience_id: 7 });
    expect(result.text).toBe('Intervenant 1 : Bonjour.');
  });
});
