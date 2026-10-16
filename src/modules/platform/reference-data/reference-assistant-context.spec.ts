import { selectReferenceContext } from './reference-assistant-context';
import { ReferenceItem } from '../../reference-data/reference-data.types';
const item = (
  kind: string,
  key: string,
  values: any = {},
  links: any = {},
): ReferenceItem => ({ kind, key, values, links, active: true });
describe('Reference assistant context retrieval', () => {
  it('finds a requested item beyond the first hundred records', () => {
    const items = Array.from({ length: 350 }, (_, index) =>
      item('stages', 'stage_' + index, { name: 'Étape numéro ' + index }),
    );
    items.push(
      item('stages', 'cassation', { name: 'Vérification spéciale cassation' }),
    );
    const result = selectReferenceContext(
      items,
      'Explique Vérification spéciale cassation',
      'stages',
    );
    expect(result.items.some((record) => record.key === 'cassation')).toBe(
      true,
    );
  });
  it('loads selected role permissions and stable relation dependencies', () => {
    const permission = item('permissions', 'view_dossiers', {
      description: 'Voir les dossiers',
    });
    const role = item('roles', 'juriste', {
      name: 'Juriste',
      permissions: ['view_dossiers'],
    });
    const family = item('action_families', 'LEGAL', { label: 'Juridique' });
    const action = item(
      'action_definitions',
      'DRAFT',
      { label: 'Rédiger' },
      { family_id: { kind: family.kind, key: family.key } },
    );
    const result = selectReferenceContext(
      [action, role, permission, family],
      'Explique les éléments sélectionnés',
      'roles',
      ['roles/juriste', 'action_definitions/DRAFT'],
    );
    expect(result.items).toEqual(
      expect.arrayContaining([role, permission, family, action]),
    );
  });
  it('caps large template bodies and reports truncation', () => {
    const model = item('mail_templates', 'LARGE', {
      name: 'Grand modèle',
      body_html: 'a'.repeat(500000),
    });
    const result = selectReferenceContext(
      [model],
      'Explique ce modèle',
      'mail_templates',
      ['mail_templates/LARGE'],
    );
    expect(result.truncated).toContain('mail_templates/LARGE');
    expect(JSON.stringify(result.items).length).toBeLessThan(85000);
  });
});
