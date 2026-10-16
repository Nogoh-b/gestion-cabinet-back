import { ReferenceAdapter } from './reference-adapter';
import { ReferenceItem, orderItems, fingerprint } from './reference-data.types';
import { businessRole } from 'src/core/auth/business-role';
import { referenceJson } from './reference-json';
const item = (
  kind: string,
  key: string,
  values: any = {},
  links: any = {},
): ReferenceItem => ({ kind, key, active: true, values, links });
describe('Reference configuration safeguards', () => {
  const adapter = new ReferenceAdapter({} as any, {} as any);
  function snapshot(before: ReferenceItem | null, applied?: ReferenceItem) {
    return {
      normalized: new Map([['roles/legal', before]]),
      provenance: new Map(applied ? [['roles/legal', { applied }]] : []),
      local: new Map([['roles/legal', before ? { id: 1 } : null]]),
    } as any;
  }
  it('orders permission and category dependencies even when an edited parent was moved to the end', () => {
    const role = item('roles', 'legal', { permissions: ['view_dossiers'] });
    const permission = item('permissions', 'view_dossiers');
    const doc = item('document_types', 'DOC', { categories: ['CAT'] });
    const category = item('document_categories', 'CAT');
    const ordered = orderItems([role, doc, permission, category]);
    expect(ordered.indexOf(permission)).toBeLessThan(ordered.indexOf(role));
    expect(ordered.indexOf(category)).toBeLessThan(ordered.indexOf(doc));
  });
  it('does not recreate a locally removed default', () => {
    const baseline = item('roles', 'legal', { name: 'Legal' });
    expect(
      adapter.changes([baseline], snapshot(null, baseline))[0].action,
    ).toBe('conflict');
  });
  it('preserves an unknown or customized record until explicit replacement', () => {
    const before = item('roles', 'legal', { name: 'Local' }),
      next = item('roles', 'legal', { name: 'Default' });
    expect(adapter.changes([next], snapshot(before))[0].action).toBe(
      'conflict',
    );
    expect(adapter.changes([next], snapshot(before, next))[0].action).toBe(
      'conflict',
    );
  });
  it('updates an untouched record and ignores permission array order', () => {
    const baseline = item('roles', 'legal', {
      name: 'Legal',
      permissions: ['b', 'a'],
    });
    const before = item('roles', 'legal', {
      name: 'Legal',
      permissions: ['a', 'b'],
    });
    const next = item('roles', 'legal', {
      name: 'New',
      permissions: ['a', 'b'],
    });
    expect(
      adapter
        .changes(
          [baseline, item('permissions', 'a'), item('permissions', 'b')],
          snapshot(before, baseline),
        )
        .find((c) => c.item.kind === 'roles')!.action,
    ).toBe('unchanged');
    expect(
      adapter
        .changes(
          [next, item('permissions', 'a'), item('permissions', 'b')],
          snapshot(before, baseline),
        )
        .find((c) => c.item.kind === 'roles')!.action,
    ).toBe('update');
  });
  it('versions the parent graph when only a stage changes', () => {
    const template = item('procedure_templates', 'T', { name: 'T' }),
      stage = item(
        'stages',
        'S',
        { name: 'Changed' },
        { templateId: { kind: template.kind, key: template.key } },
      );
    const oldStage = { ...stage, values: { name: 'Old' } };
    const s = {
      normalized: new Map([
        ['procedure_templates/T', template],
        ['stages/S', oldStage],
      ]),
      provenance: new Map([
        ['procedure_templates/T', { applied: template }],
        ['stages/S', { applied: oldStage }],
      ]),
      local: new Map([
        ['procedure_templates/T', { id: 't' }],
        ['stages/S', { id: 's' }],
      ]),
    } as any;
    expect(
      adapter
        .changes([stage, template], s)
        .find((c) => c.item.kind === 'procedure_templates')?.action,
    ).toBe('update');
  });
  it('rejects partial replacement of a customized procedure graph', () => {
    const t = item('procedure_templates', 'T'),
      s = item('stages', 'S', {}, { templateId: { kind: t.kind, key: t.key } });
    const changes = [t, s].map((i) => ({ item: i, action: 'conflict' })) as any;
    expect(() => adapter.validateOverrides(changes, ['stages/S'])).toThrow(
      'ensemble',
    );
    expect(() =>
      adapter.validateOverrides(changes, ['procedure_templates/T', 'stages/S']),
    ).not.toThrow();
  });
  it('does not inherit an administrative or client bypass from a custom role category', () => {
    expect(businessRole({ role: 'legal', base_role: 'admin' })).toBe(
      'collaborateur',
    );
    expect(businessRole({ role: 'legal', base_role: 'client' })).toBe(
      'collaborateur',
    );
    expect(businessRole({ role: 'legal', base_role: 'avocat' })).toBe('avocat');
    expect(businessRole({ role: 'admin' })).toBe('admin');
  });
  it('compresses large versioned templates and reads legacy JSON snapshots', () => {
    const data = [
      item('mail_templates', 'T', {
        body_html: '<p>Bonjour</p>'.repeat(100000),
      }),
    ];
    const stored = referenceJson.to(data);
    expect(Buffer.byteLength(stored)).toBeLessThan(100000);
    expect(referenceJson.from(stored)).toEqual(data);
    expect(referenceJson.from(JSON.stringify(data))).toEqual(data);
  });
  it('uses stable fingerprints independent of object property order', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
});
