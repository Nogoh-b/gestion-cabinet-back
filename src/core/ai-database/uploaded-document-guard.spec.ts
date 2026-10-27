import { WritePlan } from './dto/analysis-response.dto';
import {
  attachSourceFiles,
  isFilingRequest,
  uploadedFilePlannerNote,
  withoutUploadedDocumentInserts,
} from './uploaded-document-guard';

const plan = (operations: WritePlan['operations']): WritePlan => ({
  transaction: true,
  operations,
  humanReadable: 'Plan',
  confidence: 0.9,
});

describe('withoutUploadedDocumentInserts', () => {
  it('retire la création de document et les opérations qui en dépendent', () => {
    const result = withoutUploadedDocumentInserts(
      plan([
        { operation: 'INSERT', entity: 'audiences', fields: { dossier_id: 90 }, tempId: 'audience', humanReadable: '' },
        { operation: 'INSERT', entity: 'document_customer', fields: { name: 'cdd.pdf' }, tempId: 'doc', humanReadable: '' },
        { operation: 'UPDATE', entity: 'audiences', fields: { document_id: '{{doc.id}}' }, tempId: 'link', humanReadable: '' },
        { operation: 'INSERT', entity: 'diligences', fields: {}, tempId: 'task', dependsOn: ['link'], humanReadable: '' },
      ]),
    );
    expect(result.removed).toBe(3);
    expect(result.plan.operations.map((op) => op.tempId)).toEqual(['audience']);
  });

  it('laisse intact un plan sans document', () => {
    const original = plan([
      { operation: 'INSERT', entity: 'audiences', fields: {}, tempId: 'a', humanReadable: '' },
      { operation: 'UPDATE', entity: 'document_customer', entityId: 4, fields: { description: 'x' }, humanReadable: '' },
    ]);
    const result = withoutUploadedDocumentInserts(original);
    expect(result.removed).toBe(0);
    expect(result.plan.operations).toEqual(original.operations);
  });
});

describe('Note du planner pour les fichiers joints', () => {
  const names = ['fiche OVAMBE.png', 'fiche MBARGA.png'];

  it('les fichiers sont la source : un dossier par affaire, client avant dossier, fichier source cité', () => {
    const note = uploadedFilePlannerNote(names, 'lie le contenu de ses fichiers et crée les différents dossiers');
    expect(note).toContain('« fiche OVAMBE.png », « fiche MBARGA.png »');
    expect(note).toContain('un INSERT dossiers par fichier');
    expect(note).toContain('INSERT customer');
    expect(note).toContain('"sourceFiles"');
    expect(note).toContain('ne prévois aucune opération sur document_customer');
  });

  it('ne propose le classement que si la demande le réclame', () => {
    const note = uploadedFilePlannerNote(names, 'crée les dossiers et classe les fichiers dedans');
    expect(note).toContain('prévois une opération INSERT sur document_customer');
    expect(uploadedFilePlannerNote(['cdd.pdf'], 'ajoute ce document au dossier')).toContain('Le fichier « cdd.pdf » accompagne');
  });

  it('reconnaît une demande de classement des fichiers', () => {
    for (const question of [
      'ajoute ce document au dossier DOS-2026-0038',
      'crée les dossiers et classe les fichiers dedans',
      'crée les dossiers et les documents',
      'ouvre les dossiers puis range-les dans chaque dossier',
    ]) expect(isFilingRequest(question)).toBe(true);
    for (const question of [
      'lie le contenu de ses fichiers et crée les différents dossiers',
      'crée un dossier pour chaque document',
      'ajoute le client de cette image',
      'crée ces clients à partir des fiches',
    ]) expect(isFilingRequest(question)).toBe(false);
  });
});

describe('attachSourceFiles', () => {
  const documents = [
    { name: 'fiche OVAMBE.png', content: 'Client : Jean OVAMBE NDONO. Objet : recouvrement de loyers impayés.' },
    { name: 'fiche MBARGA.pdf', content: 'Cliente : Alice MBARGA. Objet : divorce par consentement mutuel.' },
  ];

  it('garde les noms cités par le modèle, même sans extension, et écarte les noms inconnus', () => {
    const result = attachSourceFiles(
      plan([
        { operation: 'INSERT', entity: 'dossiers', fields: {}, tempId: 'd1', humanReadable: '', sourceFiles: ['fiche ovambe'] },
        { operation: 'INSERT', entity: 'dossiers', fields: {}, tempId: 'd2', humanReadable: '', sourceFiles: ['inconnu.pdf'] },
      ]),
      documents,
    );
    expect(result.operations[0].sourceFiles).toEqual(['fiche OVAMBE.png']);
    expect(result.operations[1].sourceFiles).toBeUndefined();
  });

  it('retrouve le fichier par les valeurs de l’opération, sinon par le client dont dépend le dossier', () => {
    const result = attachSourceFiles(
      plan([
        { operation: 'INSERT', entity: 'customer', fields: { first_name: 'Alice', last_name: 'MBARGA' }, tempId: 'c2', humanReadable: '' },
        { operation: 'INSERT', entity: 'dossiers', fields: { client_id: '{{c2.id}}', object: 'Divorce' }, tempId: 'd2', humanReadable: '' },
        { operation: 'INSERT', entity: 'dossiers', fields: { object: 'Recouvrement de loyers impayés' }, tempId: 'd1', humanReadable: '' },
      ]),
      documents,
    );
    expect(result.operations.map((op) => op.sourceFiles)).toEqual([
      ['fiche MBARGA.pdf'],
      ['fiche MBARGA.pdf'],
      ['fiche OVAMBE.png'],
    ]);
  });

  it('un seul fichier est la source de toutes les créations ; un doute laisse le choix à l’utilisateur', () => {
    const single = attachSourceFiles(
      plan([{ operation: 'INSERT', entity: 'dossiers', fields: {}, tempId: 'd', humanReadable: '' }]),
      [documents[0]],
    );
    expect(single.operations[0].sourceFiles).toEqual(['fiche OVAMBE.png']);
    const unsure = attachSourceFiles(
      plan([{ operation: 'INSERT', entity: 'dossiers', fields: { object: 'Objet' }, tempId: 'd', humanReadable: '' }]),
      documents,
    );
    expect(unsure.operations[0].sourceFiles).toBeUndefined();
  });
});
