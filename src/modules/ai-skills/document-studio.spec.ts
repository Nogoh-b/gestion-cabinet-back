/// <reference types="jest" />
import type { AiSkillContext, DocumentDraft } from 'src/core/ai-database/skills/ai-skill.types';
import {
  documentHtml,
  fillTemplateValues,
  htmlToMarkup,
  inlineMarkup,
  parseSectionedAnswer,
  readDocumentHtml,
  templateVariableNames,
} from './document-markup';
import {
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

  it('garde images, couleurs, retraits et tableaux fusionnés d’un document repris', () => {
    const image = '<img src="data:image/png;base64,AAAA" style="width: 50%; height: auto">';
    const merged = '<table><tbody><tr><td colspan="2">Fusion</td></tr></tbody></table>';
    const html = [
      `<p style="text-align: center">${image}</p>`,
      '<p data-caption="" style="text-align:center;"><em>Figure 1 – Plan des lieux</em></p>',
      '<p style="margin-left: 36pt; line-height: 1.5">Texte <span style="color: #b91c1c">en rouge</span> et <strong>gras</strong></p>',
      merged,
      '<table style="min-width: 50px"><colgroup><col style="width: 120px"><col style="min-width: 25px"></colgroup><tbody><tr><td style="background-color: #fef9c3">A</td><td>B</td></tr></tbody></table>',
      '<div data-page-break=""></div>',
      '<p>Fin</p>',
    ].join('');
    const { markup, keep } = readDocumentHtml(html, { keep: true });
    expect(markup).toBe([
      '[[centre]] [[image 1]]',
      '[[legende]] Figure 1 – Plan des lieux',
      '[[f3]] Texte [[couleur #b91c1c]]en rouge[[/couleur]] et **gras**',
      '[[tableau 2]]',
      '[[f1]]\n| [[f2]] A | B |',
      '[[saut de page]]',
      'Fin',
    ].join('\n\n'));
    // L'IA reformule le texte et recopie les repères : tout est remis à l'identique.
    const revised = documentHtml(markup.replace('Texte', 'Nouveau texte').replace('Fin', '[[droite]] [[f3]] Fin'), keep);
    expect(revised).toContain(`<p style="text-align:center;">${image}</p>`);
    expect(revised).toContain('<p data-caption="" style="text-align:center;"><em>Figure 1 – Plan des lieux</em></p>');
    expect(revised).toContain('<p style="margin-left: 36pt; line-height: 1.5">Nouveau texte <span style="color: #b91c1c">en rouge</span> et <strong>gras</strong></p>');
    expect(revised).toContain(merged);
    expect(revised).toContain('<table style="width:100%;"><colgroup><col style="width: 120px"><col style="min-width: 25px"></colgroup><tbody><tr><td style="background-color: #fef9c3">A</td><td>B</td></tr></tbody></table>');
    expect(revised).toContain('<div data-page-break=""></div>');
    expect(revised).toContain('<p style="text-align:right; margin-left: 36pt; line-height: 1.5">Fin</p>');
  });

  it('écrit couleur, surlignage et taille demandés à l’IA, et les relit en clair', () => {
    expect(documentHtml("# [[couleur rouge]]LETTRE D'ASSIGNATION EN JUSTICE[[/couleur]]"))
      .toBe('<h1 style="text-align:center;"><span style="color: #dc2626">LETTRE D\'ASSIGNATION EN JUSTICE</span></h1>');
    expect(documentHtml('Le [[surligne]]délai[[/surligne]] de [[taille 14]]**huit jours**[[/taille]] et [[couleur #1e3a8a]]bleu'))
      .toBe('<p>Le <mark data-color="#fef08a" style="background-color: #fef08a">délai</mark> de <span data-text-style="" style="font-size: 14pt"><strong>huit jours</strong></span> et <span style="color: #1e3a8a">bleu</span></p>');
    // Valeur non permise : repère retiré, texte gardé.
    expect(documentHtml('[[couleur red;background:url(x)]]a[[/couleur]] [[taille 400]]b[[/taille]]')).toBe('<p>a b</p>');
    // HTML de l'éditeur → balisage lisible, puis retour identique.
    const editor = '<p>Texte <span style="color: #dc2626">rouge</span>, <mark data-color="#bbf7d0" style="background-color: #bbf7d0">vert</mark>, <span data-text-style="" style="font-size: 16pt">grand</span></p>';
    const { markup, keep } = readDocumentHtml(editor, { keep: true });
    expect(markup).toBe('Texte [[couleur #dc2626]]rouge[[/couleur]], [[surligne #bbf7d0]]vert[[/surligne]], [[taille 16]]grand[[/taille]]');
    expect(documentHtml(markup, keep)).toBe(editor);
  });

  it('écrit une police de l’éditeur sur un passage, et retire les repères inventés par l’IA', () => {
    expect(documentHtml('Texte en [[police Lora]]Lora[[/police]] et [[police times]]Times[[/police]] et [[police Comic]]x[[/police]]'))
      .toBe('<p>Texte en <span data-text-style="" style="font-family: \'Lora\'">Lora</span> et <span data-text-style="" style="font-family: \'Times New Roman\'">Times</span> et x</p>');
    const editor = '<p><span data-text-style="" style="font-family: \'Merriweather\'">Serif</span></p>';
    expect(htmlToMarkup(editor)).toBe('[[police Merriweather]]Serif[[/police]]');
    // Fermetures d'alignement inventées, repère coupé : jamais affichés.
    expect(documentHtml('[[centre]] **TRIBUNAL**[[/centre]]\n\n# Titre[[/droite]] [[/')).toBe('<p style="text-align:center;"><strong>TRIBUNAL</strong></p>\n<h1 style="text-align:center;">Titre </h1>');
  });

  it('referme un passage oublié et retire les repères inventés ou sans document repris', () => {
    const { keep } = readDocumentHtml('<p><span style="color: red">rouge</span></p><p><img src="data:image/png;base64,AAAA"></p>', { keep: true });
    expect(documentHtml('Texte [[s1]]rouge\nsuite', keep)).toBe('<p>Texte <span style="color: red">rouge<br/>suite</span></p>');
    expect(documentHtml('A [[s9]]b[[/s9]] [[image 7]] [[f4]]', keep)).toBe('<p>A b  </p>');
    expect(documentHtml('[[tableau 2]]\n\nTexte [[s1]]x[[/s1]] [[image 1]]')).toBe('<p>Texte x </p>');
    // Lecture simple (modèle, pièce) : ni images ni repères.
    expect(htmlToMarkup('<p><span style="color: red">rouge</span> <img src="x.png"></p>')).toBe('rouge');
  });

  it('écrit graphiques et schémas en blocs que l’IA peut modifier, image reprise s’ils n’ont pas changé', () => {
    const spec = {
      type: 'bar', title: 'Honoraires', unit: 'FCFA', xKey: 'label', xLabel: 'Mois',
      series: [{ key: 's0', label: 'Facturé' }], data: [{ label: 'Janvier', s0: 1500 }, { label: 'Février', s0: 2000 }],
    };
    const chart = `<img src="data:image/png;base64,CHART" data-chart="${JSON.stringify(spec).replace(/"/g, '&quot;')}">`;
    const diagram = '<img src="data:image/png;base64,FLOW" data-diagram="flowchart TD\nA[&quot;Mise en demeure&quot;] --&gt; B[&quot;Assignation&quot;]">';
    const { markup, keep } = readDocumentHtml(`<p style="text-align:center">${chart}</p><p>${diagram}</p>`, { keep: true });
    expect(markup).toBe(`[[graphique barres | titre=Honoraires | unite=FCFA]]
| Mois | Facturé |
|---|---|
| Janvier | 1500 |
| Février | 2000 |
[[/graphique]]

[[schema]]
flowchart TD
A["Mise en demeure"] --> B["Assignation"]
[[/schema]]`);
    // Inchangés : les images d'origine (déjà dessinées) reviennent.
    expect(documentHtml(markup, keep)).toBe(`<p style="text-align:center;">${chart}</p>\n<p style="text-align:center;">${diagram}</p>`);
    // Modifiés : nouvelles données, image à dessiner par le navigateur.
    const changed = documentHtml(markup.replace('| Février | 2000 |', '| Février | 2 500,50 |\n| Mars | 900 |').replace('B["Assignation"]', 'B["Audience"]'), keep);
    const data = JSON.parse(/data-chart="([^"]*)"/.exec(changed)![1].replace(/&quot;/g, '"'));
    expect(data.data).toEqual([{ label: 'Janvier', s0: 1500 }, { label: 'Février', s0: 2500.5 }, { label: 'Mars', s0: 900 }]);
    expect(changed).not.toContain('CHART');
    expect(changed).toContain('<img data-diagram="flowchart TD\nA[&quot;Mise en demeure&quot;] --&gt; B[&quot;Audience&quot;]" alt="Schéma" style="width: 75%; height: auto">');
    // HTML de l'éditeur : « > » laissé tel quel dans l'attribut.
    expect(htmlToMarkup('<p><img src="data:image/png;base64,FLOW" alt="Schéma" data-diagram="flowchart LR\nA --> B"></p><p>Suite</p>'))
      .toBe('[[schema]]\nflowchart LR\nA --> B\n[[/schema]]\n\nSuite');
  });

  it('crée graphique, schéma, légende et saut de page depuis un document rédigé', () => {
    const html = documentHtml(`[[graphique camembert | titre=Répartition]]
| Poste | Part |
| Honoraires | 70 |
| Frais | 30 |
[[/graphique]]
[[legende]] Figure 1 – **Répartition** des coûts

\`\`\`mermaid
timeline
  2026 : Assignation
\`\`\`

[[saut de page]]
Suite`);
    expect(html).toContain('data-chart="{&quot;type&quot;:&quot;pie&quot;,&quot;title&quot;:&quot;Répartition&quot;');
    expect(html).toContain('<p data-caption="" style="text-align:center;"><em>Figure 1 – <strong>Répartition</strong> des coûts</em></p>');
    expect(html).toContain('<img data-diagram="timeline\n  2026 : Assignation" alt="Schéma"');
    expect(html).toContain('<div data-page-break=""></div>\n<p>Suite</p>');
    // Un graphique sans chiffres n'est pas rendu ; le texte d'un schéma est échappé.
    expect(documentHtml('[[graphique barres]]\n| A |\n[[/graphique]]')).toBe('');
    expect(documentHtml('[[schema]]\n<img onerror=x>\n[[/schema]]')).toContain('data-diagram="&lt;img onerror=x&gt;"');
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

  it('trouve le modèle du cabinet par son nom et le remplit avec la fiche', async () => {
    const templates = templatesMock([
      { id: 40, code: 'ia_bail', name: 'Contrat de bail commercial', title: 'BAIL', entity_type: 'dossier', body_html: '<p>Bail de {{client.full_name}}</p>', orientation: 'portrait', paper_size: 'a4', font_family: null, header_block_id: 3, footer_block_id: null, is_active: true },
      { id: 41, code: 'ia_vente', name: 'Contrat de vente', title: 'VENTE', entity_type: 'general', body_html: '<p>Vente</p>', is_active: true },
    ]);
    const context = ctx({ question: 'Rédige le bail commercial selon notre modèle' });
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templates as any).run(context));
    // Seul un champ de la fiche : rempli sans l'IA.
    expect(context.llm.draft).not.toHaveBeenCalled();
    expect(draft.studio).toMatchObject({ basedOn: { id: 40, name: 'Contrat de bail commercial' }, layout: { templateId: 40, header_block_id: 3 } });
    expect(draft.studio!.suggestTemplate).toBeUndefined();
  });

  it('suit un modèle sans champ comme trame de rédaction', async () => {
    const templates = templatesMock([
      { id: 42, code: 'ia_protocole', name: 'Protocole transactionnel', title: 'PROTOCOLE', entity_type: 'general', body_html: '<p>Entre les soussignés ……… </p>', orientation: 'portrait', paper_size: 'a4', is_active: true },
    ]);
    const context = ctx({ question: 'Rédige le protocole transactionnel du dossier' });
    (context.llm.draft as jest.Mock).mockResolvedValue(answer);
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templates as any).run(context));
    expect((context.llm.draft as jest.Mock).mock.calls[0][0]).toContain('Entre les soussignés');
    expect(draft.studio).toMatchObject({ basedOn: { id: 42 } });
  });

  it('sans modèle correspondant, rédige et propose de l’enregistrer comme modèle', async () => {
    const context = ctx({ question: 'Rédige la reconnaissance de dette du dossier' });
    (context.llm.draft as jest.Mock).mockResolvedValue(answer);
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock([{ id: 41, code: 'ia_vente', name: 'Contrat de vente', title: 'VENTE', entity_type: 'general', body_html: '<p>{{prix}}</p>', is_active: true }]) as any).run(context);
    expect(outcome.draft.studio).toMatchObject({ mode: 'document', suggestTemplate: true });
    expect(outcome.markdown).toContain('enregistrer comme modèle');
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

  it('applique une mise en forme générale : police et taille du document, tableau, sans demander de précision', async () => {
    const context = ctx({
      question: 'met en forme police tailles, tableau et graphique',
      references: [],
      params: { revise: { html: '<p>Monsieur Talla contre Madame Nono.</p>', mode: 'document', title: '', name: 'Assignation', layout: { orientation: 'portrait', paper_size: 'a4', font_family: null, header_block_id: null, footer_block_id: null } } },
    });
    (context.llm.draft as jest.Mock).mockResolvedValue('| Partie | Nom |\n|---|---|\n| Demandeur | Talla |\n\nMonsieur Talla contre Madame Nono.\n\n===NOTES===\nTITRE: Assignation\nPOLICE: Merriweather\nTAILLE: 12');
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain('sans demander de précision');
    expect(prompt).toContain('[[police Lora]]');
    expect(prompt).toContain('POLICE: <une de : Inter');
    expect(draft.studio!.layout).toMatchObject({ font_family: 'merriweather', font_size: 12 });
    expect(draft.studio!.html).toContain('<table');
    // Police indisponible pour tout le document (Times) : la mise en page ne change pas.
    (context.llm.draft as jest.Mock).mockResolvedValue('Texte\n\n===NOTES===\nPOLICE: Times New Roman\nTAILLE: 40');
    const second = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    expect(second.studio!.layout).toMatchObject({ font_family: null });
    expect(second.studio!.layout!.font_size).toBeUndefined();
  });

  it('met en couleur le titre encadré (mise en page) et les titres du texte', async () => {
    const context = ctx({
      question: "LETTRE D'ASSIGNATION EN JUSTICE doit être de couleur rouge, et les grands titres aussi",
      references: [],
      params: {
        revise: {
          html: "<h2>OBJET : LETTRE D'ASSIGNATION EN JUSTICE</h2><p>Madame, Monsieur,</p>",
          mode: 'document',
          title: "LETTRE D'ASSIGNATION EN JUSTICE",
          name: "Lettre d'assignation",
          layout: { orientation: 'portrait', paper_size: 'a4', font_family: null, header_block_id: null, footer_block_id: null },
        },
      },
    });
    (context.llm.draft as jest.Mock).mockResolvedValue(
      "# [[couleur rouge]]LETTRE D'ASSIGNATION EN JUSTICE[[/couleur]]\n\n## [[couleur rouge]]OBJET : LETTRE D'ASSIGNATION EN JUSTICE[[/couleur]]\n\nMadame, Monsieur,\n\n===NOTES===\nTITRE: Lettre",
    );
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    // L'IA voit le titre encadré comme première ligne, et sait le colorer.
    expect(prompt).toContain("\"\"\"\n# LETTRE D'ASSIGNATION EN JUSTICE\n\n## OBJET");
    expect(prompt).toContain('[[couleur rouge]]texte[[/couleur]]');
    // Le titre encadré prend la couleur ; il n'est pas répété dans le texte.
    expect(draft.studio!.title).toBe("LETTRE D'ASSIGNATION EN JUSTICE");
    expect(draft.studio!.layout).toMatchObject({ title_color: '#dc2626', orientation: 'portrait' });
    expect(draft.studio!.html).toBe("<h2><span style=\"color: #dc2626\">OBJET : LETTRE D'ASSIGNATION EN JUSTICE</span></h2>\n<p>Madame, Monsieur,</p>");
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
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
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
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain('- preneur_nom (valeur courte)');
    expect(prompt).toContain('- clauses_particulieres (texte rédigé');
    expect(prompt).not.toContain('- client.full_name');
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    expect(draft.studio!.html).toBe(`<p>Entre {{client.full_name}} et Société X.</p><p>Clause 1</p>\n<p>Clause 2</p><p>Le ${today}, Me Kaby</p>`);
    expect(draft).toMatchObject({ templateId: 40, entityType: 'dossier', entityId: 91, dossierId: 91 });
    expect(draft.studio).toMatchObject({ title: 'CONTRAT DE BAIL', layout: { templateId: 40, font_family: 'inter', footer_block_id: 7 }, basedOn: { id: 40 } });
  });

  it('demande quel document, avec les modèles de la fiche et les Word / PDF du dossier à modifier', async () => {
    const context = ctx({ question: 'Génère un document depuis un modèle' });
    const targets = targetsMock(info(), [
      { id: 41, name: 'Contrat de prestation.docx', file_mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', is_confidential: false },
      { id: 42, name: 'Photo.jpg', file_mimetype: 'image/jpeg', is_confidential: false },
      { id: 43, name: 'Note.pdf', file_mimetype: 'application/pdf', is_confidential: true },
    ]);
    const outcome: any = await new RedigerDocumentSkill(targets as any, templatesMock([bail, attestation]) as any).run(context);
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('Quel document');
    // Modèles du dossier (et généraux) seulement ; puis le Word du dossier, à ouvrir.
    expect(outcome.followUps[0].params).toMatchObject({ templateId: 40, target: { type: 'dossier', id: 91 } });
    expect(outcome.followUps.map((item: any) => item.params.templateId)).not.toContain(2);
    expect(outcome.followUps.at(-1)).toMatchObject({ label: '✏️ Modifier « Contrat de prestation »', params: { sourceDocumentId: 41, openOnly: true } });
    expect(outcome.followUps).toHaveLength(2);
  });

  it('plusieurs modèles aussi proches : boutons, plus « Rédiger sans modèle »', async () => {
    const autre = { ...bail, id: 44, code: 'ia_bail_habitation', name: 'Contrat de bail habitation' };
    const context = ctx({ question: 'Prépare le contrat de bail' });
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock([bail, autre]) as any).run(context);
    expect(outcome.type).toBe('answer');
    expect(outcome.followUps.map((item: any) => item.params.templateId ?? item.params.freeDraft)).toEqual([40, 44, true]);
  });

  it('remplit un modèle client avec le client du dossier, et demande la fiche sinon', async () => {
    const withDossier = ctx({ question: 'Attestation de suivi' });
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(withDossier));
    expect(draft).toMatchObject({ templateId: 2, entityType: 'client', entityId: 83 });
    expect(withDossier.llm.draft).not.toHaveBeenCalled();

    const alone = ctx({ question: 'Attestation de suivi', references: [] });
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock([bail, attestation]) as any).run(alone);
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

// 25/10/2026 : « rediges un document sous la base de ce modèle facture client »
// partait en lecture des factures ; le modèle et la fiche se lisent désormais
// dans la demande et dans la conversation.
describe('Document depuis un modèle cité dans la conversation', () => {
  const factureClient = {
    id: 50, code: 'facture_client', name: 'Facture — Version client', title: 'FACTURE', entity_type: 'facture', variant: 'client',
    body_html: '<p>Facture {{numero}}</p>', orientation: 'portrait', paper_size: 'a4', font_family: null,
    header_block_id: null, footer_block_id: null, is_active: true, is_system: true,
  };
  const factureStandard = { ...factureClient, id: 51, code: 'facture_standard', name: 'Facture — Standard', variant: 'standard' };
  const invoice = (id: number, numero: string) => ({ type: 'facture' as const, id, label: `Facture ${numero}` });

  function targets(records: Array<{ type: 'facture'; id: number; label: string }> = []) {
    const mock: any = targetsMock();
    mock.load = jest.fn(async (target: any) => target.type === 'facture'
      ? info({ type: 'facture', table: 'factures', id: target.id, label: target.label, resource: { id: target.id }, mailEntity: { type: 'facture', id: target.id } })
      : info());
    mock.recordsFor = jest.fn(async () => records);
    return mock;
  }

  const readAnswer = {
    role: 'assistant',
    content: 'Facture FAC-2026-0001 — Client : Patrick Talla — Échéance : 23 novembre 2026',
    refs: [{ entity: 'factures', type: 'facture', id: 7, label: 'FAC-2026-0001' }, { entity: 'dossiers', type: 'dossier', id: 91, label: 'DOS-2026-0001' }],
  };

  it('la phrase signalée : modèle nommé par son code, facture lue au tour précédent', async () => {
    const mock = targets();
    const context = ctx({
      question: 'rediges un document sous la base de ce modèle facture client',
      history: [{ role: 'user', content: 'les factures du dossier DOS-2026-0001' }, readAnswer],
    });
    (context.llm.draft as jest.Mock).mockResolvedValue('{}');
    const outcome: any = await new RedigerDocumentSkill(mock, templatesMock([factureStandard, factureClient]) as any).run(context);
    expect(draftOf(outcome)).toMatchObject({ templateId: 50, entityType: 'facture', entityId: 7 });
    expect(mock.load).toHaveBeenCalledWith(expect.objectContaining({ type: 'facture', id: 7 }));
    // Suites : voir le modèle, en choisir un autre, rédiger sans modèle.
    expect(outcome.followUps.map((item: any) => item.label)).toEqual([
      'Voir le modèle « Facture — Version client »',
      'Choisir un autre modèle',
      '✍️ Rédiger sans modèle',
    ]);
    expect(outcome.followUps[0]).toMatchObject({ skill: 'modeles', params: { action: 'read', family: 'pdf', code: 'facture_client' } });
    expect(outcome.followUps[1]).toMatchObject({ skill: 'rediger_document', question: context.question, params: { chooseTemplate: true } });
  });

  it('plusieurs factures au dossier : un bouton par facture, sans choix au hasard', async () => {
    const mock = targets([invoice(7, 'FAC-2026-0001'), invoice(8, 'FAC-2026-0002')]);
    const context = ctx({ question: 'rédige un document sur la base du modèle facture client' });
    const outcome: any = await new RedigerDocumentSkill(mock, templatesMock([factureClient]) as any).run(context);
    expect(outcome.type).toBe('clarify');
    expect(outcome.markdown).toContain('Laquelle utiliser pour Dossier DOS-2026-0001');
    expect(outcome.followUps.slice(0, 2).map((item: any) => item.params)).toEqual([
      { templateId: 50, target: { type: 'facture', id: 7, label: 'Facture FAC-2026-0001' } },
      { templateId: 50, target: { type: 'facture', id: 8, label: 'Facture FAC-2026-0002' } },
    ]);
    expect(outcome.followUps.at(-1)).toMatchObject({ label: 'Choisir un autre modèle', params: { chooseTemplate: true } });
  });

  it('« ce modèle » : le modèle lu au tour précédent, la seule facture du dossier', async () => {
    const mock = targets([invoice(7, 'FAC-2026-0001')]);
    const context = ctx({
      question: 'rédige un document sur la base de ce modèle',
      history: [
        { role: 'user', content: 'montre-moi le modèle facture client' },
        { role: 'assistant', content: '## Facture — Version client\n\nModèle de document pour les factures' },
      ],
    });
    (context.llm.draft as jest.Mock).mockResolvedValue('{}');
    const draft = draftOf(await new RedigerDocumentSkill(mock, templatesMock([factureStandard, factureClient]) as any).run(context));
    expect(draft).toMatchObject({ templateId: 50, entityType: 'facture', entityId: 7 });
  });

  it('« ce modèle » sans modèle cité plus tôt : les modèles au choix', async () => {
    const context = ctx({ question: 'rédige un document sur la base de ce modèle' });
    const outcome: any = await new RedigerDocumentSkill(targets(), templatesMock([factureStandard, factureClient]) as any).run(context);
    expect(outcome.type).toBe('answer');
    expect(outcome.markdown).toContain('Je ne retrouve pas le modèle évoqué');
    expect(outcome.followUps.map((item: any) => item.params.templateId ?? item.params.freeDraft)).toEqual(expect.arrayContaining([50, 51, true]));
  });

  it('« Choisir un autre modèle » : tous les modèles, la cible gardée', async () => {
    const context = ctx({ question: 'rediges un document sous la base de ce modèle facture client', params: { chooseTemplate: true } });
    const outcome: any = await new RedigerDocumentSkill(targets(), templatesMock([factureStandard, factureClient]) as any).run(context);
    expect(outcome.type).toBe('answer');
    expect(outcome.followUps.filter((item: any) => item.params.templateId).map((item: any) => item.params.templateId).sort()).toEqual([50, 51]);
    expect(outcome.followUps[0].params.target).toMatchObject({ type: 'dossier', id: 91 });
  });
});

// 21/10/2026 : modifier un Word / PDF déjà classé ; « Classer » en fait la
// version suivante du même document.
describe('Modifier un document classé', () => {
  const contract = {
    id: 41,
    name: 'Contrat de prestation.docx',
    html: '<h1>CONTRAT DE PRESTATION</h1><p>Article 1 — Objet</p>',
    text: 'CONTRAT DE PRESTATION\nArticle 1 — Objet',
    format: 'docx' as const,
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    version: 2,
    dossierId: 91,
    categoryId: 5,
    confidential: false,
  };
  const mention = [{ type: 'document', label: 'Contrat de prestation', data: { id: 41 } }];

  it('applique la consigne au document mentionné et garde sa source pour la nouvelle version', async () => {
    const readDocumentForEdit = jest.fn(async () => contract);
    const context = ctx({ question: 'Ajoute une clause de confidentialité', references: mention, readDocumentForEdit });
    (context.llm.draft as jest.Mock).mockResolvedValue('# CONTRAT DE PRESTATION\n\nArticle 1 — Objet\n\n## Article 2 — Confidentialité\nLes parties…\n\n===NOTES===\nTITRE: Contrat');
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context);

    expect(readDocumentForEdit).toHaveBeenCalledWith(41);
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain('# CONTRAT DE PRESTATION');
    expect(prompt).toContain('Ajoute une clause de confidentialité');
    const draft = draftOf(outcome);
    expect(draft.studio).toMatchObject({ sourceDocument: { id: 41, version: 2, format: 'docx', categoryId: 5 } });
    expect(draft.studio!.html).toContain('Confidentialité');
    expect(draft.templateName).toBe('Contrat de prestation');
    expect(outcome.markdown).toContain('version 3');
  });

  it('la modification suivante (carte) garde le document source', async () => {
    const context = ctx({
      question: 'Raccourcis l’article 2',
      references: [],
      params: { revise: { html: '<p>Texte</p>', mode: 'document', name: 'Contrat de prestation', sourceDocument: { id: 41, name: 'Contrat de prestation.docx', version: 2, format: 'docx', categoryId: 5 } } },
    });
    (context.llm.draft as jest.Mock).mockResolvedValue('Texte court\n\n===NOTES===\nTITRE: Contrat');
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    expect(draft.studio!.sourceDocument).toMatchObject({ id: 41, version: 2 });
  });

  it('« Modifier « X » » sans consigne : ouvert tel quel, sans appel au modèle', async () => {
    const context = ctx({ question: 'Modifier le document « Contrat de prestation »', params: { sourceDocumentId: 41, openOnly: true }, readDocumentForEdit: jest.fn(async () => contract) });
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context);
    expect(context.llm.draft).not.toHaveBeenCalled();
    expect(outcome.draft.studio).toMatchObject({ html: contract.html, sourceDocument: { id: 41 } });
    expect(outcome.markdown).toContain('version 3');
  });

  it('retrouve dans le dossier la pièce nommée par la demande', async () => {
    const readDocumentForEdit = jest.fn(async () => contract);
    const targets = targetsMock(info(), [
      { id: 41, name: 'Contrat de prestation.docx', file_mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { id: 50, name: 'Bail commercial.pdf', file_mimetype: 'application/pdf' },
    ]);
    const context = ctx({ question: 'Modifie le contrat de prestation : la durée passe à 24 mois', readDocumentForEdit });
    (context.llm.draft as jest.Mock).mockResolvedValue('Texte\n\n===NOTES===\nTITRE: Contrat');
    await new RedigerDocumentSkill(targets as any, templatesMock() as any).run(context);
    expect(readDocumentForEdit).toHaveBeenCalledWith(41);
  });

  it('refuse un document confidentiel ou sans le droit de modifier', async () => {
    const confidential = ctx({ question: 'Corrige ce document', references: mention, readDocumentForEdit: jest.fn(async () => ({ ...contract, confidential: true })) });
    const outcome: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(confidential);
    expect(outcome).toMatchObject({ type: 'clarify' });
    expect(outcome.markdown).toContain('confidentiel');

    const permissions = { missingPermissions: jest.fn(async () => ['edit_document']) };
    const denied = ctx({ question: 'Corrige ce document', references: mention, readDocumentForEdit: jest.fn(async () => contract) });
    const refusal: any = await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any, permissions as any).run(denied);
    expect(refusal.markdown).toContain('modifier un document');
  });

  it('un PDF est repris par son texte, mise en page à vérifier', async () => {
    const pdf = { ...contract, name: 'Bail.pdf', html: '', text: 'BAIL COMMERCIAL\n\nArticle 1', format: 'pdf' as const };
    const context = ctx({ question: 'Modifie le bail : loyer de 300 000 FCFA', references: mention, readDocumentForEdit: jest.fn(async () => pdf) });
    (context.llm.draft as jest.Mock).mockResolvedValue('# BAIL COMMERCIAL\n\nArticle 1\n\n===NOTES===\nTITRE: Bail');
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock() as any).run(context));
    expect((context.llm.draft as jest.Mock).mock.calls[0][0]).toContain("vient d'un PDF");
    expect(draft.studio!.checks).toContain('Document repris d’un PDF : vérifiez la mise en page reconstruite.');
    expect(draft.studio!.sourceDocument).toMatchObject({ format: 'pdf' });
  });
});

describe('Courrier et mise en demeure (modèles du cabinet)', () => {
  const courrier = {
    id: 292, code: 'general_courrier', name: 'Général — Courrier type', title: 'COURRIER', entity_type: 'general', variant: 'standard',
    body_html: '<p>{{recipientName}}</p><p>{{recipientAddress}}</p><p>Objet : {{subject}}</p>{{bodyContent}}<p>{{signatoryName}}</p>',
    orientation: 'portrait', paper_size: 'a4', is_active: true, is_system: true, tenant_id: 1,
  };

  it('ancien bouton « En faire un courrier » : le corps donné est repris, le destinataire par défaut est le client', async () => {
    const context = ctx({ question: 'Mets cette traduction en forme de courrier.', params: { templateCode: 'general_courrier', bodyContent: 'Bonjour,\n\nVoici la traduction.', subject: 'Traduction' } });
    (context.llm.draft as jest.Mock).mockResolvedValue('{"recipientAddress": ""}');
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock([courrier]) as any).run(context));
    expect(draft.studio!.html).toContain('<p>Jean Dupont</p>');
    expect(draft.studio!.html).toContain('Objet : Traduction');
    expect(draft.studio!.html).toContain('Voici la traduction.');
    expect(draft.studio).toMatchObject({ basedOn: { id: 292 } });
  });

  it('« rédige un courrier » : le modèle courrier est trouvé et ses règles de lettre sont données', async () => {
    const context = ctx({ question: 'Rédige un courrier au client pour le renvoi' });
    (context.llm.draft as jest.Mock).mockResolvedValue(JSON.stringify({ recipientName: '', recipientAddress: '', subject: 'Objet : renvoi', bodyContent: "Madame, Monsieur,\n\nL'audience est renvoyée." }));
    const draft = draftOf(await new RedigerDocumentSkill(targetsMock() as any, templatesMock([courrier]) as any).run(context));
    const prompt = (context.llm.draft as jest.Mock).mock.calls[0][0];
    expect(prompt).toContain("Le modèle imprime déjà l'en-tête");
    expect(draft.studio!.html).toContain('Objet : Renvoi');
  });
});
