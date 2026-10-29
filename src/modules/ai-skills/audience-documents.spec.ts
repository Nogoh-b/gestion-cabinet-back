/// <reference types="jest" />
// Documents tirés d'une audience enregistrée (rapport, procès-verbal, projet de
// décision) et transcription assemblée donnée aux compétences.
import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import { RecordingTranscriptStatus } from '../audiences/recordings/audience-recording.entity';
import { assembleTranscript, transcriptFacts } from '../audiences/recordings/audience-transcript.service';
import { audienceDocumentKind, ProjetDecisionAudienceSkill, RapportAudienceSkill } from './audience-documents.skills';
import { SkillTargetsService } from './skill-targets.service';
import { TranscrireAudioSkill } from './transcription.skills';

const AUDIENCE_REF = { type: 'audience', label: 'Audience du 29/10/2026', data: { id: 7 } };

const ANSWER = `# PROJET DE DÉCISION
PROJET

Le tribunal, après avoir entendu Intervenant 1 (passage inaudible dans l'enregistrement)…

===NOTES===
TITRE: Projet de décision
FICHIER: Projet de décision - DOS-2026-0037
A_VERIFIER:
- Montant de la créance : ………
PIECES: aucune`;

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: "Rédige le projet de décision d'après la transcription de l'audience.",
  references: [AUDIENCE_REF],
  documents: [],
  params: {},
  user: { id: 12 },
  userId: '12',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn(), draft: jest.fn(async () => ANSWER) } as any,
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

const assembled = (rows: Array<{ transcript?: string | null; status?: RecordingTranscriptStatus | null }>) =>
  assembleTranscript(rows.map((row, index) => ({
    id: index + 1,
    session_id: 's1',
    segment_index: index,
    duration_seconds: 300,
    transcript: row.transcript ?? null,
    transcript_status: row.status === undefined ? RecordingTranscriptStatus.DONE : row.status,
    created_at: new Date(2026, 9, 29, 9, 0, index),
  }) as any));

function targets(options: { transcript?: ReturnType<typeof assembled> | null; resource?: Record<string, unknown> } = {}) {
  const info = {
    type: 'audience', table: 'audiences', id: 7, label: 'Audience du 29/10/2026 · DOS-2026-0037',
    resource: { id: 7, audience_date: '2026-10-29', status: 1, ...options.resource },
    dossier: { id: 89, dossier_number: 'DOS-2026-0037' }, client: { id: 83, full_name: 'Jean DUPONT' },
  };
  const transcript = options.transcript === undefined
    ? assembled([
        { transcript: 'Intervenant 1 : Nous demandons la condamnation du défendeur [inaudible].' },
        { status: RecordingTranscriptStatus.FAILED },
      ])
    : options.transcript;
  return {
    info,
    load: jest.fn(async () => info),
    facts: jest.fn(async () => 'Audience : 29/10/2026 — TPI Douala'),
    sender: jest.fn(async () => ({ name: 'Me Kamga', title: 'Avocat', cabinetName: 'Cabinet K', cabinetAddress: '' })),
    audienceTranscript: jest.fn(async () => (transcript ? { assembled: transcript, facts: transcriptFacts(transcript) } : null)),
  };
}

const dataSource = (lastId: number | null = 7) => {
  const qb: any = { where: () => qb, andWhere: () => qb, orderBy: () => qb, getOne: async () => (lastId ? { id: lastId } : null) };
  return { getRepository: () => ({ createQueryBuilder: () => qb }) } as any;
};

describe('Projet de décision d’audience', () => {
  it('rédige d’après la transcription, signale les lacunes et propose d’enregistrer dans la décision', async () => {
    const deps = targets();
    const context = ctx();
    const outcome: any = await new ProjetDecisionAudienceSkill(deps as any, dataSource()).run(context);

    expect(outcome.type).toBe('document_draft');
    expect(outcome.draft.audience).toEqual({ id: 7, label: 'Audience du 29/10/2026', past: true, saveAs: 'decision' });
    expect(outcome.draft.dossierId).toBe(89);
    expect(outcome.draft.studio.html).toContain('PROJET');
    expect(outcome.draft.studio.sources).toEqual([{ name: "Enregistrements de l'audience", origin: 'dossier' }]);
    const checks: string[] = outcome.draft.studio.checks;
    expect(checks).toContain('Montant de la créance : ………');
    expect(checks.some((item) => item.includes('1 segment(s)') && item.includes('non transcrit'))).toBe(true);
    expect(checks.some((item) => item.includes('1 passage(s) inaudible(s)'))).toBe(true);
    expect(checks).toContain('Projet de travail : il ne vaut pas décision rendue.');
    expect(outcome.markdown).toContain("décision de l'audience");

    // La transcription n'est donnée qu'une fois, avec ses règles ; les faits sans elle.
    expect(deps.facts).toHaveBeenCalledWith(deps.info, context.user, context.question, { transcriptMax: 0 });
    const prompt = (context.llm as any).draft.mock.calls[0][0] as string;
    expect(prompt).toContain('PROJET DE DÉCISION');
    expect(prompt).toContain('SEGMENTS NON TRANSCRITS');
    expect(prompt).toContain('Nous demandons la condamnation du défendeur [inaudible]');
    expect(prompt).toContain("n'invente aucun propos");
    expect(prompt.match(/Transcription automatique de l'audience/g)?.length).toBe(1);
  });

  it.each([
    ['programmée', 0],
    ['en cours', 4],
  ])('audience %s : refuse de rédiger avant la fin de l’audience', async (_label, status) => {
    const deps = targets({ resource: { status } });
    const context = ctx();
    const outcome: any = await new ProjetDecisionAudienceSkill(deps as any, dataSource()).run(context);
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('après l');
    expect(deps.audienceTranscript).not.toHaveBeenCalled();
    expect((context.llm as any).draft).not.toHaveBeenCalled();
  });

  it('sans transcription ni notes : demande d’enregistrer ou de saisir des notes', async () => {
    const deps = targets({ transcript: assembled([{ status: RecordingTranscriptStatus.PENDING }]) });
    const context = ctx();
    const outcome: any = await new ProjetDecisionAudienceSkill(deps as any, dataSource()).run(context);
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('ne sont pas encore transcrits');
    expect((context.llm as any).draft).not.toHaveBeenCalled();
  });

  it('sans enregistrement mais avec des notes : rédige d’après les notes et le dit', async () => {
    const deps = targets({ transcript: null, resource: { notes: '<p>Renvoi demandé par la partie adverse.</p>' } });
    const context = ctx();
    const outcome: any = await new ProjetDecisionAudienceSkill(deps as any, dataSource()).run(context);
    expect(outcome.type).toBe('document_draft');
    const prompt = (context.llm as any).draft.mock.calls[0][0] as string;
    expect(prompt).toContain('Renvoi demandé par la partie adverse.');
    expect(prompt).toContain("Aucun enregistrement transcrit pour cette audience");
    expect(outcome.draft.studio.checks.some((item: string) => item.startsWith('Rédigé sans enregistrement transcrit'))).toBe(true);
  });

  it('cible dossier : prend sa dernière audience passée', async () => {
    const deps = targets();
    const outcome: any = await new ProjetDecisionAudienceSkill(deps as any, dataSource(7)).run(
      ctx({ references: [{ type: 'dossier', label: 'DOS-2026-0037', data: { id: 89 } }] }),
    );
    expect(deps.load).toHaveBeenCalledWith({ type: 'audience', table: 'audiences', id: 7, label: '' });
    expect(outcome.type).toBe('document_draft');
  });
});

describe('Rapport / procès-verbal d’audience', () => {
  it('rapport par défaut, enregistrable dans le rapport de l’audience', async () => {
    const context = ctx({ question: "Rédige le rapport d'audience." });
    const outcome: any = await new RapportAudienceSkill(targets() as any, dataSource()).run(context);
    expect(outcome.draft.audience.saveAs).toBe('report');
    expect((context.llm as any).draft.mock.calls[0][0]).toContain("RAPPORT D'AUDIENCE");
  });

  it('procès-verbal demandé par paramètre', async () => {
    const context = ctx({ question: 'Rédige le document.', params: { kind: 'pv' } });
    const outcome: any = await new RapportAudienceSkill(targets() as any, dataSource()).run(context);
    expect(outcome.draft.audience.saveAs).toBe('report');
    expect((context.llm as any).draft.mock.calls[0][0]).toContain("PROCÈS-VERBAL D'AUDIENCE");
  });

  it('reconnaît le type de document dans la demande', () => {
    expect(audienceDocumentKind("Procès-verbal de l'audience")).toBe('pv');
    expect(audienceDocumentKind('Projet de dispositif')).toBe('decision');
    expect(audienceDocumentKind("Rapport de l'audience")).toBe('rapport');
    expect(audienceDocumentKind('peu importe', 'pv')).toBe('pv');
  });
});

describe('Transcription d’audience dans les faits des compétences', () => {
  const info: any = { type: 'audience', id: 7, resource: { id: 7, audience_date: '2026-10-29' }, dossier: null, client: null };
  const permissions = (missing: string[] = []) => ({
    missingPermissions: jest.fn(async (_user: any, codes: string[]) => codes.filter((code) => missing.includes(code))),
  }) as any;
  const transcripts = { assemble: jest.fn(async () => assembled([{ transcript: 'Intervenant 1 : Bonjour.' }])) };

  it('ajoute la transcription aux faits d’une audience', async () => {
    const service = new SkillTargetsService({} as any, permissions(), transcripts as any);
    const facts = await service.facts(info, { id: 1 });
    expect(facts).toContain('Transcription automatique de l\'audience');
    expect(facts).toContain('Intervenant 1 : Bonjour.');
  });

  it('respecte le droit de voir les audiences, et transcriptMax 0', async () => {
    const denied = new SkillTargetsService({} as any, permissions(['view_audiences']), transcripts as any);
    expect(await denied.facts(info, { id: 1 })).not.toContain('Transcription');
    const service = new SkillTargetsService({} as any, permissions(), transcripts as any);
    expect(await service.facts(info, { id: 1 }, '', { transcriptMax: 0 })).not.toContain('Transcription');
  });
});

describe('Transcrire un enregistrement — audience enregistrée', () => {
  it('ouvre la transcription assemblée des segments de l’audience', async () => {
    const deps = targets();
    const outcome: any = await new TranscrireAudioSkill(deps as any).run(ctx({ question: "Transcris l'enregistrement de l'audience" }));
    expect(outcome.type).toBe('document_draft');
    expect(outcome.draft.studio.html).toContain('<strong>Intervenant 1 :</strong> Nous demandons');
    expect(outcome.draft.studio.html).toContain('contenu manquant');
    expect(outcome.draft.studio.checks.some((item: string) => item.includes('non transcrit'))).toBe(true);
    expect(outcome.followUps.map((item: any) => item.skill)).toEqual(
      expect.arrayContaining(['compte_rendu_audience', 'rapport_audience', 'projet_decision_audience']),
    );
  });

  it('segments pas encore transcrits : invite à lancer la transcription', async () => {
    const deps = targets({ transcript: assembled([{ status: RecordingTranscriptStatus.PENDING }]) });
    const outcome: any = await new TranscrireAudioSkill(deps as any).run(ctx({ question: "Transcris l'enregistrement de l'audience" }));
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('ne sont pas encore transcrits');
  });
});
