/// <reference types="jest" />
import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import { transcriptMarkup, TranscrireAudioSkill } from './transcription.skills';

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: 'Transcris l’enregistrement de l’entretien',
  references: [{ type: 'dossier', label: 'DOS-2026-0037', data: { id: 89 } }],
  documents: [{ name: 'Transcription — entretien client.m4a', content: 'Intervenant 1 : Bonjour Maître.\nIntervenant 2 : Bonjour, asseyez-vous.' }],
  params: {},
  user: { id: 12 },
  userId: '12',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

const targets = {
  load: jest.fn(async () => ({
    type: 'dossier', id: 89, label: 'Dossier DOS-2026-0037',
    dossier: { id: 89, dossier_number: 'DOS-2026-0037' }, client: { id: 83, full_name: 'Jean DUPONT' },
  })),
};

describe('Transcrire un enregistrement', () => {
  it('ouvre la transcription dans la carte et propose compte rendu, PV et synthèse', async () => {
    const outcome: any = await new TranscrireAudioSkill(targets as any).run(ctx());
    expect(outcome.type).toBe('document_draft');
    expect(outcome.draft).toMatchObject({ dossierId: 89, templateName: 'Transcription — entretien client' });
    expect(outcome.draft.studio.html).toContain('<strong>Intervenant 1 :</strong> Bonjour Maître.');
    expect(outcome.markdown).toContain('2 intervenants');
    expect(outcome.followUps.map((item: any) => item.label)).toEqual(['Compte rendu', 'Procès-verbal', 'Synthèse et points clés']);
    expect(outcome.followUps[0]).toMatchObject({
      skill: 'rediger_document',
      params: { freeDraft: true, sourceName: 'Transcription — entretien client.m4a', target: { type: 'dossier', id: 89 } },
    });
    expect(outcome.followUps[0].params.sourceText).toContain('Bonjour Maître');
  });

  it('sans transcription jointe : indique comment enregistrer', async () => {
    const outcome: any = await new TranscrireAudioSkill(targets as any).run(ctx({ documents: [] }));
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('bouton micro');
  });

  it('met les intervenants en gras, un paragraphe par prise de parole', () => {
    expect(transcriptMarkup('Intervenant 1 : Oui.\n\nIntervenant 2 : Non.\nsuite')).toBe('**Intervenant 1 :** Oui.\n\n**Intervenant 2 :** Non.\n\nsuite');
  });
});
