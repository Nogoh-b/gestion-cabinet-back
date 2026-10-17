import { validateReferenceTemplate } from './reference-template-validation';
import { MailTemplateService } from '../mail-template/mail-template.service';
import { ReferenceItem } from './reference-data.types';

describe('Reference templates', () => {
  const template = (
    body_html: string,
    variables: string[] = [],
  ): ReferenceItem => ({
    kind: 'mail_templates',
    key: 'test',
    active: true,
    links: {},
    values: { body_html, variables: JSON.stringify(variables) },
  });
  it('accepts known variables and conditional blocks', () => {
    expect(
      validateReferenceTemplate(
        template('{{#if cabinet.nom}}Bonjour {{cabinet.nom}}{{/if}}', [
          'cabinet.nom',
        ]),
      ),
    ).toEqual([]);
  });
  it('rejects an invented variable even when it is declared by the AI', () => {
    expect(
      validateReferenceTemplate(
        template('{{secret.api_key}}', ['secret.api_key']),
      ).length,
    ).toBeGreaterThan(0);
  });
  it('rejects incomplete templates and unsupported helpers', () => {
    expect(
      validateReferenceTemplate(template('{{#if cabinet.nom}}')).length,
    ).toBeGreaterThan(0);
    expect(
      validateReferenceTemplate(template('{{lookup cabinet "secret"}}')).length,
    ).toBeGreaterThan(0);
  });
  it('keeps PDF variables specific to the rendered entity', () => {
    expect(
      validateReferenceTemplate({
        ...template('{{numero}}', ['numero']),
        kind: 'pdf_templates',
        values: {
          entity_type: 'client',
          body_html: '{{montantTTC_fmt}}',
          variables: '["montantTTC_fmt"]',
        },
      }).length,
    ).toBeGreaterThan(0);
  });
  it('does not recreate a deliberately removed notification template', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const service = new MailTemplateService(repository as any, {} as any);
    await expect(
      service.renderOrCreateSystemDefault('password_changed'),
    ).rejects.toThrow('indisponible');
    expect(repository.save).not.toHaveBeenCalled();
  });
});
