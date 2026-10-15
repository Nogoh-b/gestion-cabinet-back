import { WritePlan } from './dto/analysis-response.dto';
import { withoutUploadedDocumentInserts } from './uploaded-document-guard';

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
