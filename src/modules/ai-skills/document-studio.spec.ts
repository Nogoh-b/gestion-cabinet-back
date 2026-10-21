/// <reference types="jest" />
import type { AiSkillContext, DocumentDraft } from 'src/core/ai-database/skills/ai-skill.types';
import {
  documentHtml,
  fillTemplateValues,
  htmlToMarkup,
  inlineMarkup,
  parseSectionedAnswer,
  templateVariableNames,
} from './document-markup';
import {
  CreerModeleSkill,
  DocumentModeleSkill,
  excerpt,
  isRecordVariable,
  namedTemplate,
  normalizeRecordVariables,
  withoutLeadingTitle,
  RedigerDocumentSkill,
} from './document-studio.skills';
import type { TargetInfo } from './skill-targets.service';

const info = (extra: Partial<TargetInfo> = {}): TargetInfo => ({
  type: 'dossier',
  table: 'dossiers',
  id: 91,
  label: 'Dossier DOS-2026-0001',
  resource: { id: 91 },
  dossier: { id: 91, dossier_number: 'DOS-2026-0001', object: 'Bail commercial' } as any,
  client: { id: 83, full_name: 'Jean Dupont' } as any,
  employee: null,
  recipientName: 'Jean Dupont',
  email: null,
  phone: null,
  mailEntity: { type: 'dossier', id: 91 },
  mailParent: null,
  ...extra,
});

function targetsMock(target = info(), documents: any[] = []) {
  return {
    load: jest.fn(async () => target),
    facts: jest.fn(async () => 'Dossier : DOS-2026-0001 — objet : Bail commercial'),
    sender: jest.fn(async () => ({ name: 'Me Kaby', title: 'Avocat', cabinetName: 'Cabinet Kaby', cabinetAddress: '' })),
    attachableDocuments: jest.fn(async () => documents),
    documentsByIds: jest.fn(async () => []),
  };
}

function templatesMock(templates: any[] = []) {
  return {
    findActive: jest.fn(async () => templates),
    findOne: jest.fn(async (id: number) => templates.find((item) => item.id === id) ?? null),
  };
}

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: 'Rédige le contrat de bail commercial',
  references: [{ type: 'dossier', label: 'DOS-2026-0001', data: { id: 91 } }],
  documents: [],
  params: {},
  user: { id: 31 },
  userId: '31',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn(), draft: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async (ids: number[]) => ids.map((id) => ({ id, name: `Pièce ${id}`, content: `Texte de la pièce ${id}` }))),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

const draftOf = (outcome: any): DocumentDraft => {
  expect(outcome.type).toBe('document_draft');
  return outcome.draft;
};

describe('Balisage des documents rédigés', () => {
  it('convertit titres, paragraphes, listes, tableaux et alignements en HTML connu', () => {
    const html = documentHtml(`# CONTRAT DE BAIL

## Article 1 — Objet
Le bailleur donne à bail **le local** situé à *Douala*, __sans réserve__.

- premier point
- second point

1. un
2. deux

| Désignation | Montant |
|---|---|
| Loyer | 250 000 FCFA |

---
[[droite]] Fait à Douala, le 20 octobre 2026
> Clause citée`);
    expect(html).toContain('<h1 style="text-align:center;">CONTRAT DE BAIL</h1>');
    expect(html).toContain('<h2>Article 1 — Objet</h2>');
    expect(html).toContain('<strong>le local</strong>');
    expect(html).toContain('<em>Douala</em>');
    expect(html).toContain('<u>sans réserve</u>');
    expect(html).toContain('<ul><li>premier point</li><li>second point</li></ul>');
    expect(html).toContain('<ol><li>un</li><li>deux</li></ol>');
    expect(html).toContain('<thead><tr><th>Désignation</th><th>Montant</th></tr></thead>');
    expect(html).toContain('<td>250 000 FCFA</td>');
    expect(html).toContain('<hr/>');
    expect(html).toContain('<p style="text-align:right;">Fait à Douala, le 20 octobre 2026</p>');
    expect(html).toContain('<blockquote><p>Clause citée</p></blockquote>');
  });

  it("n'insère jamais de balise venue du texte et garde les variables des modèles", () => {
    const html = documentHtml('Bonjour <script>alert(1)</script> & {{client.full_name}}, le {{date_fmt}} {{#if montant_du}}({{montant_du}}){{/if}}');
    expect(html).not.toContain('<script');
    expect(html).toContain('‹script›');
    expect(html).toContain('&amp;');
    expect(html).toContain('{{client.full_name}}');
    expect(html).toContain('{{date_fmt}}');
    expect(html).toContain('{{#if montant_du}}({{montant_du}}){{/if}}');
    expect(inlineMarkup('nom_du_client et _italique_')).toBe('nom_du_client et <em>italique</em>');
    // Vu avec DeepSeek : le marqueur d'alignement avant le titre.
    expect(documentHtml('[[centre]] # ASSIGNATION\n[[droite]] ## Partie')).toBe('<h1 style="text-align:center;">ASSIGNATION</h1>\n<h2 style="text-align:right;">Partie</h2>');
  });

  it('relit le HTML de l’éditeur sous forme de balisage, sans perte de structure', () => {
    const markup = `# TITRE

## Partie

[[centre]] Mention **centrée**

- a
- b

| A | B |
|---|---|
| 1 | 2 |`;
    const html = documentHtml(markup);
    expect(documentHtml(htmlToMarkup(html))).toBe(html);
    expect(htmlToMarkup('<p style="text-align: justify">Texte&nbsp;<em>libre</em></p>')).toBe('[[justifie]] Texte *libre*');
  });

  it('liste et remplit les variables des modèles', () => {
    const body = '<p>{{client.full_name}} — {{#if subject}}Objet : {{subject}}{{/if}}{{#if note}}Note{{/if}} {{bodyContent}}</p>';
    expect(templateVariableNames(body)).toEqual(['client.full_name', 'subject', 'note', 'bodyContent']);
    const filled = fillTemplateValues(body, { subject: 'Loyers', note: '', bodyContent: '<p>Corps</p>' });
    expect(filled).toBe('<p>{{client.full_name}} — Objet : Loyers <p>Corps</p></p>');
  });

  it('lit la réponse sectionnée, document d’abord ou après les champs', () => {
    const notesAfter = parseSectionedAnswer(`# ACTE\nTexte\n\n===NOTES===\nTITRE: Acte de cession\nFICHIER: Cession - DOS-1\nA_VERIFIER:\n- date de signature\n- montant\nPIECES: 1, 2`);
    expect(notesAfter.body).toBe('# ACTE\nTexte');
    expect(notesAfter.fields).toMatchObject({ TITRE: 'Acte de cession', FICHIER: 'Cession - DOS-1', PIECES: '1, 2' });
    expect(notesAfter.lists.A_VERIFIER).toEqual(['date de signature', 'montant']);

    const fieldsFirst = parseSectionedAnswer('NOM: Bail\nTYPE: dossier\n===MODELE===\nCorps {{x}}');
    expect(fieldsFirst.body).toBe('Corps {{x}}');
    expect(fieldsFirst.fields.TYPE).toBe('dossier');

    expect(parseSectionedAnswer('```\nSeulement le texte\n```').body).toBe('Seulement le texte');
  });

  it('extrait le début et les passages utiles d’une longue pièce', () => {
    const text = `${'Préambule. '.repeat(40)}\n\n${'Sans rapport. '.repeat(60)}\n\nLe loyer mensuel est fixé à 250 000 FCFA.\n\n${'Fin. '.repeat(80)}`;
    const short = excerpt(text, 'quel est le loyer mensuel ?', 900);
    expect(short.length).toBeLessThanOrEqual(1000);
    expect(short).toContain('Préambule');
    expect(short).toContain('250 000 FCFA');
  });
});

describe('Rédiger un document (Word / PDF)', () => {
  const answer = `# CONTRAT DE BAIL COMMERCIAL

Entre **Jean Dupont** et ……… .

[[droite]] Fait à Douala

===NOTES===
TITRE: Contrat de bail commercial
FICHIER: Contrat de bail commercial
A_VERIFIER:
- identité du preneur
PIECES: 1`;

  it('lit les pièces du dossier et les pièces jointes, puis rend le document du studio', async () => {
    const targets = targetsMock(info(), [
      { id: 5, name: 'Bail signé.pdf', is_confidential: false },
      { id: 6, name: 'Note confidentielle', is_confidential: true },
    ]);
    const context = ctx({ documents: [{ name: 'Etat des lieux.pdf', content: 'Local de 120 m²' }] });
    (context.llm.draft as jest.Mock).mockResolvedValue(answer);
    const skill = new RedigerDocumentSkill(targets as any, templatesMock() as any);
    const draft = draftOf(await skill.run(context));

    expect(context.readDocuments).toHaveBeenCalledWith([5]);
    const [prompt, options] = (context.llm.draft as jest.Mock).mock.calls[0];
    expect(prompt).toContain('Texte de la pièce 5');
    expect(prompt).toContain('Local de 120 m²');
    expect(prompt).not.toContain('Note confidentielle');
    expect(options).toEqual({ maxTokens: 8000, live: true });

    expect(draft.studio).toMatchObject({ mode: 'document', title: '', checks: ['identité du preneur'] });
    expect(draft.studio!.html).toContain('<h1 style="text-align:center;">CONTRAT DE BAIL COMMERCIAL</h1>');
    expect(draft.studio!.sources).toEqual([
      { name: 'Etat des lieux.pdf', origin: 'chat' },
      { name: 'Pièce 5', origin: 'dossier' },
    ]);
    expect(draft).toMatchObject({ dossierId: 91, dossierLabel: 'DOS-2026-0001', fileName: 'Contrat de bail commercial - DOS-2026-0001' });
  });

  it('ne lit pas les pièces sans le droit « voir les documents »', async () => {
    const targets = targetsMock(info(), [{ id: 5, name: 'Bail signé.pdf', is_confidential: false }]);
    const permissions = { missingPermissions: jest.fn(async () => ['view_documents']) };
    const context = ctx();
    (context.llm.draft as jest.Mock).mockResolvedValue(answer);
    const draft = draftOf(await new RedigerDocumentSkill(targets as any, templatesMock() as any, permissions as any).run(context));
    expect(context.readDocuments).not.toHaveBeenCalled();
    expect(draft.studio!.checks!.some((item) => item.includes('voir les documents'))).toBe(true);
  });

  it('suit le modèle du cabinet nommé dans la demande', async () => {
    const templates = templatesMock([
      { id: 40, code: 'ia_bail', name: 'Contrat de bail commercial', title: 'BAIL', entity_type: 'dossier', body_html: '<p>Bail de {{client.full_name}}</p>', orientation: 'portrait', paper_size: 'a4', font_family: null, header_block_id: 3, footer_block_id: null, is_active: true },
      { id: 41, code: 'ia_vente', name: 'Contrat de vente', title: 'VENTE', entity_type: 'general', body_html: '<p>Vente</p>', is_active: true },
    ]);
    const context = ctx({ question: 'Rédige le bail commercial selon notre modèle' });
    (context.llm.draft as jest.Mock).mockResolvedValue(answer);
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templates as any).run(context));
    expect((context.llm.draft as jest.Mock).mock.calls[0][0]).toContain('Bail de {{client.full_name}}');
    expect(draft.studio).toMatchObject({ basedOn: { id: 40, name: 'Contrat de bail commercial' }, layout: { templateId: 40, header_block_id: 3 } });
  });

  it('applique une modification au document de la carte', async () => {
    const context = ctx({
      question: 'Ajoute une clause de confidentialité',
      references: [],
      params: {
        revise: {
          html: '<h1 style="text-align:center;">CONTRAT</h1><p>Article 1</p>',
          mode: 'document',
          title: '',
          name: 'Contrat de bail',
          fileName: 'Contrat de bail - DOS-2026-0001',
          layout: { templateId: 40, orientation: 'portrait', paper_size: 'a4', font_family: null, header_block_id: null, footer_block_id: null },
        },
      },
    });
    (context.llm.draft as jest.Mock).mockResolvedValue('# CONTRAT\n\nArticle 1\n\n## Confidentialité\nLes parties…\n\n===NOTES===\nTITRE: Contrat');
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain('Ajoute une clause de confidentialité');
    expect(prompt).toContain('# CONTRAT');
    expect(draft.studio!.html).toContain('<h2>Confidentialité</h2>');
    expect(draft).toMatchObject({ fileName: 'Contrat de bail - DOS-2026-0001', templateId: 40, templateName: 'Contrat de bail' });
  });
});

describe('Créer un modèle de document', () => {
  it('rend un modèle à enregistrer, avec ses champs propres (hors champs de la fiche)', async () => {
    const context = ctx({
      question: 'Crée un modèle de bail commercial',
      documents: [{ name: 'Bail Dupont.docx', content: 'Entre M. Dupont et la société X, loyer 250 000 FCFA.' }],
    });
    (context.llm.draft as jest.Mock).mockResolvedValue(`Entre {{client.full_name}} et {{preneur_nom}}, loyer {{montant_loyer}}.

[[droite]] Fait le {{date_fmt}}

===NOTES===
NOM: Bail commercial
TITRE: Contrat de bail commercial
TYPE: dossier
DESCRIPTION: Bail type pour les locaux commerciaux.
VARIABLES:
- preneur_nom : nom du preneur
- montant_loyer : loyer mensuel`);
    const draft = draftOf(await new CreerModeleSkill(targetsMock() as any).run(context));
    expect((context.llm.draft as jest.Mock).mock.calls[0][0]).toContain('loyer 250 000 FCFA');
    expect(draft.studio).toMatchObject({
      mode: 'template',
      title: 'CONTRAT DE BAIL COMMERCIAL',
      template: {
        name: 'Bail commercial',
        entity_type: 'dossier',
        description: 'Bail type pour les locaux commerciaux.',
        variables: [
          { name: 'preneur_nom', description: 'nom du preneur' },
          { name: 'montant_loyer', description: 'loyer mensuel' },
        ],
      },
    });
    expect(draft.studio!.html).toContain('{{client.full_name}}');
  });
});

describe('Document depuis un modèle', () => {
  const bail = {
    id: 40,
    code: 'ia_bail',
    name: 'Contrat de bail commercial',
    title: 'CONTRAT DE BAIL',
    entity_type: 'dossier',
    variant: 'standard',
    body_html: '<p>Entre {{client.full_name}} et {{preneur_nom}}.</p><p>{{clauses_particulieres}}</p><p>Le {{date_fmt}}, {{signatoryName}}</p>',
    orientation: 'portrait',
    paper_size: 'a4',
    font_family: 'inter',
    header_block_id: null,
    footer_block_id: 7,
    is_active: true,
    is_system: false,
  };
  const attestation = { ...bail, id: 2, code: 'client_attestation', name: 'Client — Attestation de suivi', title: 'ATTESTATION DE SUIVI', entity_type: 'client', body_html: '<p>{{full_name}}</p>', is_system: true };

  it("ne demande à l'IA que les champs propres au modèle", async () => {
    const context = ctx({ question: 'Prépare le contrat de bail commercial', params: { templateId: 40 } });
    (context.llm.draft as jest.Mock).mockResolvedValue('{"preneur_nom": "Société X", "clauses_particulieres": "Clause 1\\n\\nClause 2"}');
    const draft = draftOf(await new DocumentModeleSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain('- preneur_nom (valeur courte)');
    expect(prompt).toContain('- clauses_particulieres (texte rédigé');
    expect(prompt).not.toContain('- client.full_name');
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    expect(draft.studio!.html).toBe(`<p>Entre {{client.full_name}} et Société X.</p><p>Clause 1</p>\n<p>Clause 2</p><p>Le ${today}, Me Kaby</p>`);
    expect(draft).toMatchObject({ templateId: 40, entityType: 'dossier', entityId: 91, dossierId: 91 });
    expect(draft.studio).toMatchObject({ title: 'CONTRAT DE BAIL', layout: { templateId: 40, font_family: 'inter', footer_block_id: 7 }, basedOn: { id: 40 } });
  });

  it('propose les modèles en boutons quand la demande n’en nomme aucun', async () => {
    const context = ctx({ question: 'Génère un document depuis un modèle' });
    const outcome: any = await new DocumentModeleSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(context);
    expect(outcome.type).toBe('answer');
    expect(outcome.followUps.map((item: any) => item.params.templateId)).toEqual([40, 2]);
    expect(outcome.followUps[0].params.target).toMatchObject({ type: 'dossier', id: 91 });
  });

  it('remplit un modèle client avec le client du dossier, et demande la fiche sinon', async () => {
    const withDossier = ctx({ question: 'Attestation de suivi' });
    const draft = draftOf(await new DocumentModeleSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(withDossier));
    expect(draft).toMatchObject({ templateId: 2, entityType: 'client', entityId: 83 });
    expect(withDossier.llm.draft).not.toHaveBeenCalled();

    const alone = ctx({ question: 'Attestation de suivi', references: [] });
    const outcome: any = await new DocumentModeleSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(alone);
    expect(outcome.type).toBe('clarify');
  });

  it('reconnaît un modèle par ses mots propres, jamais par des mots génériques', () => {
    const list = [bail, attestation, { ...bail, id: 3, code: 'client_fiche', name: 'Client — Fiche signalétique', title: 'FICHE CLIENT' }] as any[];
    expect(namedTemplate(list, 'le contrat de bail pour ce dossier')?.id).toBe(40);
    expect(namedTemplate(list, "l'attestation de suivi du client")?.id).toBe(2);
    expect(namedTemplate(list, 'un document pour le client')).toBeUndefined();
    expect(isRecordVariable('client.full_name', 'dossier')).toBe(true);
    expect(isRecordVariable('preneur_nom', 'dossier')).toBe(false);
    expect(isRecordVariable('cabinetName', 'general')).toBe(true);
    expect(isRecordVariable('subject', 'general')).toBe(false);
  });

  it('retire le nom de la fiche devant ses propres champs (vu avec DeepSeek)', () => {
    expect(normalizeRecordVariables('{{client.full_name}} {{#if client.siret}}{{client.siret}}{{/if}} {{preneur_nom}}', 'client'))
      .toBe('{{full_name}} {{#if siret}}{{siret}}{{/if}} {{preneur_nom}}');
    expect(normalizeRecordVariables('{{dossier.dossier_number}} {{client.full_name}}', 'dossier')).toBe('{{dossier_number}} {{client.full_name}}');
    expect(normalizeRecordVariables('{{client.full_name}}', 'general')).toBe('{{client.full_name}}');
    expect(withoutLeadingTitle('<h1 style="text-align:center;">Contrat de bail commercial</h1>\n<p>Texte</p>', 'CONTRAT DE BAIL COMMERCIAL')).toBe('<p>Texte</p>');
    expect(withoutLeadingTitle('<h1>Autre titre</h1><p>Texte</p>', 'CONTRAT')).toBe('<h1>Autre titre</h1><p>Texte</p>');
  });
});
