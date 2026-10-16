import { validateReferenceTemplate } from './reference-template-validation';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityMetadata } from 'typeorm';
import { Permission } from '../iam/permission/entities/permission.entity';
import { UserRole } from '../iam/user-role/entities/user-role.entity';
import {
  ActionFamily,
  ActionDefinition,
} from '../case-workflow/entities/action-catalog.entity';
import { RecommendationRule } from '../case-workflow/entities/recommendation.entity';
import { AudienceType } from '../audience-type/entities/audience-type.entity';
import { TypeCustomer } from '../customer/type-customer/entities/type_customer.entity';
import { DocumentCategory } from '../document-category/entities/document-category.entity';
import { DocumentType } from '../documents/document-type/entities/document-type.entity';
import { InvoiceType } from '../invoice-type/entities/invoice-type.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { ProcedureTemplate } from '../procedure/entities/procedure-template.entity';
import { Stage } from '../procedure/entities/stage.entity';
import { SubStage } from '../procedure/entities/sub-stage.entity';
import { Transition } from '../procedure/entities/transition.entity';
import { Cycle } from '../procedure/entities/cycle.entity';
import { StageConfig } from '../procedure/entities/stage-config.entity';
import { PdfTemplate } from '../pdf-templates/entities/pdf-template.entity';
import { MailTemplate } from '../mail-template/entities/mail-template.entity';
import { TemplateBlock } from '../template-blocks/entities/template-block.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { ReferenceItem, itemId, orderItems } from './reference-data.types';
import { UserRole as BuiltinRole } from 'src/core/enums/user-role.enum';
import {
  PLATFORM_PERMISSION_CODES,
  PROTECTED_PERMISSION_CODES,
} from '../iam/constants/iam.constants';
import { findForbiddenJsonLogicOperator } from '../case-workflow/case-workflow.logic';

export const REFERENCE_KINDS = [
  ['permissions', 'Droits', 'Permissions', Permission],
  ['roles', 'Droits', 'Rôles', UserRole],
  ['action_families', 'Actions', 'Familles', ActionFamily],
  ['action_definitions', 'Actions', 'Actions', ActionDefinition],
  [
    'recommendation_rules',
    'Actions',
    'Règles de recommandation',
    RecommendationRule,
  ],
  ['currencies', 'Devises', 'Devises', null],
  ['jurisdictions', 'Métier', 'Juridictions', Jurisdiction],
  [
    'document_categories',
    'Métier',
    'Catégories de documents',
    DocumentCategory,
  ],
  ['document_types', 'Métier', 'Types de documents', DocumentType],
  ['audience_types', 'Métier', 'Types d’audience', AudienceType],
  ['customer_types', 'Métier', 'Types de clients', TypeCustomer],
  ['invoice_types', 'Métier', 'Types de factures', InvoiceType],
  [
    'procedure_templates',
    'Procédures',
    'Modèles de procédure',
    ProcedureTemplate,
  ],
  ['stages', 'Procédures', 'Étapes', Stage],
  ['sub_stages', 'Procédures', 'Sous-étapes', SubStage],
  ['transitions', 'Procédures', 'Transitions', Transition],
  ['cycles', 'Procédures', 'Cycles', Cycle],
  ['stage_configs', 'Procédures', 'Configuration des étapes', StageConfig],
  ['procedure_types', 'Procédures', 'Types et sous-types', ProcedureType],
  ['pdf_templates', 'Modèles', 'Modèles PDF', PdfTemplate],
  ['mail_templates', 'Modèles', 'Courriels et compositions', MailTemplate],
  ['template_blocks', 'Modèles', 'Blocs et en-têtes', TemplateBlock],
  ['settings', 'Configuration', 'Configuration initiale', null],
] as const;

export const INITIAL_SETTING_FIELDS = [
  'default_chat_group_name',
  'app_locale',
  'date_format',
  'currency',
  'currency_symbol',
  'currency_symbol_position',
  'currency_decimals',
  'currency_thousands_sep',
  'currency_decimal_sep',
  'invoice_prefix',
  'invoice_padding',
  'invoice_numbering_strategy',
  'invoice_number_format',
  'dossier_prefix',
  'dossier_number_format',
  'working_hours_start',
  'working_hours_end',
  'notification_email',
  'notification_sms',
  'theme_name',
  'font_ui',
  'font_heading',
  'font_mono',
  'default_font_size',
  'default_sidebar_style',
];
const SYSTEM_FIELDS = new Set([
  'id',
  'tenant_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'createdAt',
  'updatedAt',
  'version',
  'lock_version',
]);
export const RESERVED_PERMISSIONS = [
  ...PROTECTED_PERMISSION_CODES,
  ...PLATFORM_PERMISSION_CODES,
];
export const CURRENCY_FIELDS = [
  'code',
  'label',
  'symbol',
  'position',
  'decimals',
  'thousands_sep',
  'decimal_sep',
  'flag',
];

@Injectable()
export class ReferenceRegistry {
  constructor(readonly db: DataSource) {}
  definition(kind: string) {
    const result = REFERENCE_KINDS.find((d) => d[0] === kind);
    if (!result) throw new BadRequestException('Référentiel inconnu : ' + kind);
    return result;
  }
  metadata(kind: string): EntityMetadata {
    const entity = this.definition(kind)[3];
    if (!entity) throw new BadRequestException('Référentiel virtuel');
    return this.db.getMetadata(entity);
  }
  kindForTable(table: string): string | undefined {
    return REFERENCE_KINDS.find(
      (d) => d[3] && this.db.getMetadata(d[3]).tableName === table,
    )?.[0];
  }
  columns(kind: string) {
    const meta =
      kind === 'settings' ? this.db.getMetadata(Cabinet) : this.metadata(kind);
    return meta.columns.filter((c) =>
      kind === 'settings'
        ? INITIAL_SETTING_FIELDS.includes(c.propertyName)
        : !SYSTEM_FIELDS.has(c.propertyName),
    );
  }
  relationFields(kind: string): Record<string, string> {
    if (kind === 'settings' || kind === 'currencies') return {};
    const result: Record<string, string> = {};
    for (const relation of this.metadata(kind).relations) {
      if (!relation.isManyToOne && !relation.isOneToOneOwner) continue;
      const targetKind = this.kindForTable(
        relation.inverseEntityMetadata.tableName,
      );
      if (!targetKind) continue;
      for (const column of relation.joinColumns)
        result[column.propertyName] = targetKind;
    }
    // Some old procedure relations are scalar columns without TypeORM relations.
    const known: Record<string, Record<string, string>> = {
      pdf_templates: {
        header_block_id: 'template_blocks',
        footer_block_id: 'template_blocks',
      },
      mail_templates: {
        header_block_id: 'template_blocks',
        footer_block_id: 'template_blocks',
      },
      stages: { templateId: 'procedure_templates' },
      sub_stages: { stageId: 'stages' },
      transitions: {
        templateId: 'procedure_templates',
        fromStageId: 'stages',
        toStageId: 'stages',
      },
      cycles: {
        templateId: 'procedure_templates',
        startStageId: 'stages',
        endStageId: 'stages',
      },
      stage_configs: { stageId: 'stages' },
      procedure_types: {
        parent_id: 'procedure_types',
        template_id: 'procedure_templates',
      },
    };
    const existing = new Set(this.columns(kind).map((c) => c.propertyName));
    for (const [field, target] of Object.entries(known[kind] ?? {}))
      if (existing.has(field)) result[field] = target;
    return result;
  }
  schema() {
    return REFERENCE_KINDS.map(([kind, group, label]) => ({
      kind,
      group,
      label,
      fields:
        kind === 'currencies'
          ? CURRENCY_FIELDS.map((name) => ({
              name,
              type: name === 'decimals' ? 'number' : 'text',
              nullable: name === 'flag',
            }))
          : this.columns(kind)
              .filter(
                (c) =>
                  !Object.keys(this.relationFields(kind)).includes(
                    c.propertyName,
                  ),
              )
              .map((c) => ({
                name: c.propertyName,
                type: ['json', 'simple-json', 'simple-array'].includes(
                  String(c.type),
                )
                  ? 'json'
                  : c.type === Boolean ||
                      ['boolean', 'bool'].includes(String(c.type))
                    ? 'boolean'
                    : c.type === Number ||
                        [
                          'int',
                          'tinyint',
                          'smallint',
                          'decimal',
                          'float',
                          'double',
                        ].includes(String(c.type))
                      ? 'number'
                      : c.type === 'text' || c.type === 'longtext'
                        ? 'textarea'
                        : 'text',
                nullable: c.isNullable,
                length: c.length ? Number(c.length) : undefined,
                options: c.enum,
                default:
                  typeof c.default === 'function' ? undefined : c.default,
              }))
              .concat(
                kind === 'roles'
                  ? [
                      {
                        name: 'permissions',
                        type: 'json',
                        nullable: false,
                      } as any,
                    ]
                  : kind === 'document_types'
                    ? [
                        {
                          name: 'categories',
                          type: 'json',
                          nullable: false,
                        } as any,
                      ]
                    : [],
              ),
      relations: this.relationFields(kind),
    }));
  }
  validate(
    items: ReferenceItem[],
    knownPermissionCodes: Set<string>,
  ): string[] {
    const errors: string[] = [],
      ids = new Set<string>();
    if (
      !Array.isArray(items) ||
      items.some(
        (item) =>
          !item ||
          typeof item.kind !== 'string' ||
          typeof item.key !== 'string' ||
          typeof item.active !== 'boolean' ||
          !item.values ||
          typeof item.values !== 'object' ||
          Array.isArray(item.values) ||
          !item.links ||
          typeof item.links !== 'object' ||
          Array.isArray(item.links) ||
          Object.values(item.links).some(
            (link: any) =>
              !link ||
              typeof link.kind !== 'string' ||
              typeof link.key !== 'string',
          ),
      )
    )
      return ['Structure de référentiel invalide'];
    for (const item of items) {
      const id = itemId(item);
      if (ids.has(id)) errors.push('Clé en double : ' + id);
      ids.add(id);
      if (!/^[^\x00-\x1f]{1,191}$/.test(item.key))
        errors.push('Clé invalide : ' + id);
      try {
        this.definition(item.kind);
        if (item.values.code !== undefined && item.values.code !== item.key)
          errors.push(
            id + ': le code doit rester identique à la clé de référence',
          );
        if (
          !item.values ||
          Array.isArray(item.values) ||
          typeof item.values !== 'object'
        )
          throw Error('Valeurs invalides');
        const fields =
          item.kind === 'currencies'
            ? CURRENCY_FIELDS
            : this.columns(item.kind).map((c) => c.propertyName);
        const allowed = new Set([
          ...fields,
          ...(item.kind === 'roles'
            ? ['permissions']
            : item.kind === 'document_types'
              ? ['categories']
              : []),
        ]);
        for (const key of Object.keys(item.values))
          if (
            !allowed.has(key) ||
            Object.hasOwn(this.relationFields(item.kind), key)
          )
            errors.push(id + ': champ non modifiable ' + key);
        for (const [field, link] of Object.entries(item.links ?? {})) {
          if (this.relationFields(item.kind)[field] !== link.kind)
            errors.push(id + ': relation invalide ' + field);
        }
        if (item.kind !== 'currencies')
          for (const c of this.columns(item.kind)) {
            if (Object.hasOwn(this.relationFields(item.kind), c.propertyName)) {
              if (
                !c.isNullable &&
                !item.links[c.propertyName] &&
                c.default === undefined
              )
                errors.push(id + ': relation requise ' + c.propertyName);
              continue;
            }
            const value = item.values[c.propertyName];
            if (value === null && !c.isNullable)
              errors.push(id + ': valeur requise ' + c.propertyName);
            if (
              value === undefined &&
              !c.isNullable &&
              c.default === undefined &&
              item.kind !== 'settings'
            )
              errors.push(id + ': champ requis ' + c.propertyName);
            if (value !== undefined && value !== null) {
              if (
                c.length &&
                typeof value === 'string' &&
                value.length > Number(c.length)
              )
                errors.push(id + ': champ trop long ' + c.propertyName);
              if (c.enum && !c.enum.includes(value))
                errors.push(id + ': valeur invalide ' + c.propertyName);
              if (
                (c.type === Boolean || c.type === 'boolean') &&
                typeof value !== 'boolean'
              )
                errors.push(id + ': booléen requis ' + c.propertyName);
              if (
                (c.type === Number ||
                  [
                    'int',
                    'tinyint',
                    'smallint',
                    'float',
                    'decimal',
                    'double',
                  ].includes(String(c.type))) &&
                !Number.isFinite(Number(value))
              )
                errors.push(id + ': nombre requis ' + c.propertyName);
            }
          }
        if (
          item.kind === 'permissions' &&
          RESERVED_PERMISSIONS.includes(item.key) &&
          item.active
        )
          errors.push(id + ': permission système réservée');
        if (
          item.kind === 'settings' &&
          (Object.keys(item.values).length !== 1 ||
            !Object.hasOwn(item.values, item.key))
        )
          errors.push(id + ': un paramètre doit porter la clé de son champ');
        if (
          item.kind === 'document_types' &&
          (!Array.isArray(item.values.categories) ||
            item.values.categories.some(
              (key: any) =>
                !items.some(
                  (i) =>
                    i.kind === 'document_categories' &&
                    i.key === key &&
                    (!item.active || i.active),
                ),
            ))
        )
          errors.push(id + ': catégories absentes ou inactives');
        if (item.kind === 'settings' && !item.active)
          errors.push(
            id + ': les paramètres initiaux ne peuvent pas être désactivés',
          );
        if (
          item.kind === 'permissions' &&
          (!knownPermissionCodes.has(item.key) || item.values.code !== item.key)
        )
          errors.push(id + ': permission technique inconnue ou renommée');
        if (item.kind === 'roles') {
          const code = item.values.code,
            base = item.values.base_role ?? code;
          if (!/^[a-z][a-z0-9_]{0,63}$/.test(code) || code !== item.key)
            errors.push(id + ': code de rôle invalide');
          if (!Object.values(BuiltinRole).includes(base))
            errors.push(id + ': catégorie métier inconnue');
          if (
            (['admin', 'client'].includes(base) ||
              ['admin', 'client'].includes(code)) &&
            base !== code
          )
            errors.push(id + ': catégorie système réservée');
          if (
            !Array.isArray(item.values.permissions) ||
            item.values.permissions.some(
              (p: string) =>
                !knownPermissionCodes.has(p) ||
                RESERVED_PERMISSIONS.includes(p),
            )
          )
            errors.push(id + ': permissions inconnues ou réservées');
          if (['admin', 'client'].includes(code) && !item.active)
            errors.push(id + ': rôle système requis');
        }
        if (item.kind === 'template_blocks') {
          if (
            !['mail', 'pdf'].includes(item.values.channel) ||
            !['header', 'footer'].includes(item.values.kind)
          )
            errors.push(id + ': canal ou nature de bloc invalide');
          if (
            item.active &&
            item.values.is_default &&
            items.some(
              (other) =>
                itemId(other) !== id &&
                other.kind === 'template_blocks' &&
                other.active &&
                other.values.is_default &&
                other.values.channel === item.values.channel &&
                other.values.kind === item.values.kind,
            )
          )
            errors.push(
              id + ': un seul bloc par défaut est autorisé par canal et nature',
            );
        }
        if (['mail_templates', 'pdf_templates'].includes(item.kind)) {
          for (const position of ['header', 'footer']) {
            const link = item.links[position + '_block_id'];
            const block =
              link && items.find((other) => itemId(other) === itemId(link));
            if (
              block &&
              (block.values.channel !==
                (item.kind === 'mail_templates' ? 'mail' : 'pdf') ||
                block.values.kind !== position)
            )
              errors.push(id + ': bloc ' + position + ' incompatible');
          }
        }
        if (item.kind === 'currencies') {
          if (item.values.code !== item.key || !/^[A-Z]{3}$/.test(item.key))
            errors.push(id + ': code devise invalide');
          if (
            !['before', 'after'].includes(item.values.position) ||
            !Number.isInteger(item.values.decimals) ||
            item.values.decimals < 0 ||
            item.values.decimals > 6
          )
            errors.push(id + ': format monétaire invalide');
        }
        if (
          item.kind === 'recommendation_rules' &&
          findForbiddenJsonLogicOperator(item.values.condition_json)
        )
          errors.push(id + ': opérateur de condition interdit');
        if (
          ['pdf_templates', 'mail_templates', 'template_blocks'].includes(
            item.kind,
          )
        ) {
          const html = String(
            item.values.body_html ?? item.values.content_html ?? '',
          );
          if (/<script\b|\bon\w+\s*=|javascript:/i.test(html))
            errors.push(id + ': contenu HTML actif interdit');
          if (html.length > 500000)
            errors.push(id + ': modèle trop volumineux');
          errors.push(
            ...validateReferenceTemplate(item).map(
              (message) => id + ': ' + message,
            ),
          );
          let variables = item.values.variables ?? [];
          if (typeof variables === 'string') {
            try {
              variables = JSON.parse(variables);
            } catch {
              errors.push(id + ': variables invalides');
            }
          }
          if (!Array.isArray(variables))
            errors.push(id + ': liste des variables invalide');
        }
      } catch (error) {
        errors.push(id + ': ' + (error as Error).message);
      }
    }
    for (const code of ['admin', 'client'])
      if (!items.some((i) => i.kind === 'roles' && i.key === code && i.active))
        errors.push('Rôle système manquant : ' + code);
    for (const item of items) {
      for (const link of Object.values(item.links ?? {})) {
        const target = items.find((i) => itemId(i) === itemId(link));
        if (!target)
          errors.push(itemId(item) + ': référence absente ' + itemId(link));
        else if (item.active && !target.active)
          errors.push(itemId(item) + ': dépendance inactive ' + itemId(link));
      }
      if (
        item.kind === 'roles' &&
        item.active &&
        Array.isArray(item.values.permissions)
      )
        for (const code of item.values.permissions ?? []) {
          if (
            !items.some(
              (i) => i.kind === 'permissions' && i.key === code && i.active,
            )
          )
            errors.push(itemId(item) + ': permission inactive ' + code);
        }
      if (
        item.kind === 'settings' &&
        item.values.currency !== undefined &&
        !items.some(
          (i) =>
            i.kind === 'currencies' &&
            i.key === item.values.currency &&
            i.active,
        )
      )
        errors.push('Devise par défaut absente ou inactive');
    }
    try {
      orderItems(items);
    } catch (error) {
      errors.push((error as Error).message);
    }
    return [...new Set(errors)];
  }
}
