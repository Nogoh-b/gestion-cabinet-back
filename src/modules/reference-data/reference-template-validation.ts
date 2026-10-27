import * as Handlebars from 'handlebars';
import { ReferenceItem } from './reference-data.types';
import { PDF_TEMPLATE_VARIABLES } from '../pdf-templates/seeder/pdf-template.seeder';
import { BLOCK_VARS } from '../template-blocks/seeder/template-block.seeder';
import { MAIL_VARIABLE_GROUPS } from '../mail-template/mail-variables';
import { AUTH_TEMPLATE_DEFAULTS } from '../mail-template/auth-template.defaults';
import { buildNotificationTemplates } from '../mail-template/notification-template.defaults';
import { templateListKeys } from '../mail-template/template-context';

const brand = [
  'cabinetName',
  'logoUrl',
  'brandColor',
  'contactEmail',
  'contactPhone',
  'address',
  'website',
  'emailFooter',
  'currentYear',
];
const mailVariables = new Set([
  ...MAIL_VARIABLE_GROUPS.flatMap((group) => group.variables.map((v) => v.key)),
  ...AUTH_TEMPLATE_DEFAULTS.flatMap((template) =>
    JSON.parse(template.variables ?? '[]'),
  ),
  ...buildNotificationTemplates().flatMap((template) =>
    JSON.parse(template.variables ?? '[]'),
  ),
  ...brand,
  ...templateListKeys(),
]);

/** Use the same variable catalogues as the renderers and shipped definitions.
 * A declared variable never grants access to an arbitrary property or helper.
 */
export function validateReferenceTemplate(item: ReferenceItem): string[] {
  const errors: string[] = [];
  const allowed =
    item.kind === 'mail_templates'
      ? mailVariables
      : new Set<string>(
          item.kind === 'template_blocks'
            ? JSON.parse(BLOCK_VARS)
            : [
                ...(PDF_TEMPLATE_VARIABLES[item.values.entity_type] ?? []),
                // Listes et totaux de la fiche (`{{#each dossier.factures}}`).
                ...(PDF_TEMPLATE_VARIABLES[item.values.entity_type] ? templateListKeys(item.values.entity_type) : []),
              ],
        );
  if (
    item.kind === 'pdf_templates' &&
    !PDF_TEMPLATE_VARIABLES[item.values.entity_type]
  )
    errors.push('type de document non pris en charge');
  let declared: unknown = item.values.variables ?? [];
  try {
    if (typeof declared === 'string') declared = JSON.parse(declared);
  } catch {
    return ['liste de variables invalide'];
  }
  if (
    !Array.isArray(declared) ||
    declared.some((key) => typeof key !== 'string' || !allowed.has(key))
  )
    errors.push('variable déclarée incompatible avec ce modèle');

  const path = (node: any, scopes: string[]): string | null => {
    if (node?.type !== 'PathExpression') return null;
    const name = node.original as string;
    if (node.data) {
      if (!['@index', '@key', '@first', '@last'].includes(name))
        errors.push('variable de contexte interdite : ' + name);
      return null;
    }
    const offset = node.depth ?? 0;
    const scope = scopes[Math.max(0, scopes.length - 1 - offset)] ?? '';
    const clean = name.replace(/^(\.\.\/)+/, '').replace(/^this\.?/, '');
    return [scope, clean].filter(Boolean).join('.');
  };
  const checkPath = (node: any, scopes: string[]) => {
    const key = path(node, scopes);
    if (
      key &&
      !allowed.has(key) &&
      ![...allowed].some((entry) => entry.startsWith(key + '.'))
    )
      errors.push('variable indisponible : ' + key);
  };
  const visit = (program: any, scopes: string[]) => {
    for (const node of program?.body ?? []) {
      if (node.type === 'ContentStatement' || node.type === 'CommentStatement')
        continue;
      if (node.type === 'MustacheStatement') {
        if (node.params?.length || node.hash?.pairs?.length)
          errors.push('fonction de modèle non autorisée');
        else checkPath(node.path, scopes);
      } else if (node.type === 'BlockStatement') {
        const helper = node.path.original;
        if (
          !['if', 'unless', 'each', 'with'].includes(helper) ||
          node.params.length !== 1 ||
          node.params[0]?.type !== 'PathExpression'
        )
          errors.push('condition de modèle non autorisée');
        else {
          checkPath(node.params[0], scopes);
          const nested = ['each', 'with'].includes(helper)
            ? [...scopes, path(node.params[0], scopes) ?? '']
            : scopes;
          visit(node.program, nested);
          visit(node.inverse, scopes);
        }
      } else errors.push('structure de modèle non autorisée');
    }
  };
  for (const field of ['body_html', 'content_html', 'subject']) {
    if (item.values[field] == null) continue;
    try {
      visit(Handlebars.parse(String(item.values[field])), ['']);
    } catch {
      errors.push('syntaxe de modèle invalide : ' + field);
    }
  }
  return [...new Set(errors)];
}
