/**
 * One-time, isolated capture of the shipped seed definitions. No database reads
 * or writes are performed by seeders: their repositories are in-memory only.
 * Once stored in reference_revisions, this baseline never replaces live data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ReferenceRegistry,
  INITIAL_SETTING_FIELDS,
  RESERVED_PERMISSIONS,
} from './reference-registry';
import { ReferenceItem, fingerprint } from './reference-data.types';
import { PermissionSeeder } from 'src/core/auth/seeders/permission.seeder';
import { ROLES_CONFIG } from 'src/core/auth/seeders/role.seeder';
import { Permission } from '../iam/permission/entities/permission.entity';
import {
  ActionFamily,
  ActionDefinition,
} from '../case-workflow/entities/action-catalog.entity';
import { RecommendationRule } from '../case-workflow/entities/recommendation.entity';
import { ActionCatalogService } from '../case-workflow/services/action-catalog.service';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import JurisdictionSeeder from '../jurisdiction/seeder/jurisdiction.seeder';
import DocumentCategorySeeder from '../document-category/seeder/document-category.seeder';
import DocumentTypeSeeder from '../documents/document-type/seeder/document-type.seeder';
import AudienceTypeSeeder from '../audience-type/seeder/audience-type.seeder';
import TypeCustomerSeeder from '../customer/type-customer/seeder/type-customer.seeder';
import InvoiceTypeSeeder from '../invoice-type/seeder/invoice-type.seeder';
import ProcedureTypeSeeder from '../procedures/seeder/procedure-type.seeder';
import ProcedureSubtypeSeeder from '../procedures/seeder/procedure-subtype.seeder';
import DefaultProcedureTemplateSeeder from '../procedure/seeder/default-procedure-template.seeder';
import ProcedureTemplateSeeder from '../procedure/seeder/procedure-template.seeder';
import PdfTemplateSeeder from '../pdf-templates/seeder/pdf-template.seeder';
import MailTemplateSeeder from '../mail-template/seeder/mail-template.seeder';
import MailComposerTemplateSeeder from '../mail-template/seeder/mail-composer-template.seeder';
import TemplateBlockSeeder from '../template-blocks/seeder/template-block.seeder';
import { CURRENCIES } from './legacy-currencies';

@Injectable()
export class ReferenceBootstrap {
  private readonly logger = new Logger(ReferenceBootstrap.name);
  constructor(private readonly registry: ReferenceRegistry) {}
  async capture(): Promise<ReferenceItem[]> {
    const rows = new Map<string, any[]>(),
      repos = new Map<string, any>();
    let sequence = 0;
    const getRepository = (entity: any): any => {
      const meta = this.registry.db.getMetadata(entity),
        table = meta.tableName;
      if (repos.has(table)) return repos.get(table);
      const data: any[] = [];
      rows.set(table, data);
      const match = (r: any, w: any = {}): boolean =>
        Object.entries(w).every(([k, v]: any) =>
          v && typeof v === 'object' && v._type === 'in'
            ? v._value.includes(r[k])
            : r[k] === v,
        );
      const qb = () => {
        const filters: Array<(r: any) => boolean> = [];
        const builder: any = {
          where: (sql: string, params: any) => {
            filters.length = 0;
            return builder.andWhere(sql, params);
          },
          andWhere: (sql: string, params: any) => {
            if (!params) return builder;
            const field = sql.match(/\.([\w]+)\s*(?:=|IN)/i)?.[1];
            if (field && field !== 'tenant_id') {
              const value = Object.values(params)[0];
              filters.push((r) =>
                Array.isArray(value)
                  ? value.includes(r[field])
                  : r[field] === value,
              );
            }
            return builder;
          },
          getOne: async () =>
            data.find((r) => filters.every((f) => f(r))) ?? null,
          getMany: async () => data.filter((r) => filters.every((f) => f(r))),
          getCount: async () =>
            data.filter((r) => filters.every((f) => f(r))).length,
          leftJoinAndSelect: () => builder,
          orderBy: () => builder,
        };
        return builder;
      };
      const repo: any = {
        metadata: meta,
        create: (value: any = {}) =>
          Array.isArray(value) ? value.map((v) => ({ ...v })) : { ...value },
        find: async (options: any = {}) =>
          data.filter((r) => match(r, options.where)),
        findOne: async (options: any = {}) =>
          data.find((r) => match(r, options.where)) ?? null,
        findOneBy: async (where: any) =>
          data.find((r) => match(r, where)) ?? null,
        count: async () => data.length,
        createQueryBuilder: qb,
        save: async (value: any): Promise<any> => {
          if (Array.isArray(value))
            return Promise.all(value.map((v) => repo.save(v)));
          const row = value;
          if (!row.id)
            row.id =
              meta.primaryColumns[0]?.generationStrategy === 'uuid'
                ? randomUUID()
                : ++sequence;
          for (const c of meta.columns)
            if (
              row[c.propertyName] === undefined &&
              c.default !== undefined &&
              typeof c.default !== 'function'
            )
              row[c.propertyName] = c.default;
          const i = data.findIndex((r) => r.id === row.id);
          if (i < 0) data.push(row);
          else Object.assign(data[i], row);
          return row;
        },
        update: async (id: any, patch: any) => {
          const row = data.find((r) =>
            typeof id === 'object' ? match(r, id) : r.id === id,
          );
          if (row) Object.assign(row, patch);
          return { affected: row ? 1 : 0 };
        },
        remove: async (row: any) => {
          const i = data.indexOf(row);
          if (i >= 0) data.splice(i, 1);
        },
      };
      repos.set(table, repo);
      return repo;
    };
    const fake = {
      getRepository,
      getMetadata: (entity: any) => this.registry.db.getMetadata(entity),
    } as DataSource;
    await new PermissionSeeder(getRepository(Permission)).seed();
    const seeds = [
      JurisdictionSeeder,
      DocumentCategorySeeder,
      DocumentTypeSeeder,
      AudienceTypeSeeder,
      TypeCustomerSeeder,
      InvoiceTypeSeeder,
      ProcedureTypeSeeder,
      ProcedureSubtypeSeeder,
      DefaultProcedureTemplateSeeder,
      ProcedureTemplateSeeder,
      PdfTemplateSeeder,
      MailTemplateSeeder,
      MailComposerTemplateSeeder,
      TemplateBlockSeeder,
    ];
    for (const Seeder of seeds) await new Seeder().run(fake, {} as any);
    await new ActionCatalogService(
      getRepository(ActionFamily),
      getRepository(ActionDefinition),
      getRepository(RecommendationRule),
      fake,
    ).ensureDefaults(true);
    const items: ReferenceItem[] = [],
      byLocal = new Map<string, ReferenceItem>();
    const pending: Array<{ item: ReferenceItem; row: any; kind: string }> = [];
    for (const [table, records] of rows) {
      const kind = this.registry.kindForTable(table);
      if (!kind || kind === 'roles') continue;
      for (const row of records) {
        const relations = this.registry.relationFields(kind);
        const values: Record<string, any> = {};
        for (const c of this.registry.columns(kind)) {
          if (relations[c.propertyName]) continue;
          if (row[c.propertyName] !== undefined)
            values[c.propertyName] = row[c.propertyName];
          else if (c.isNullable) values[c.propertyName] = null;
        }
        if (kind === 'document_types')
          values.categories = (row.categories ?? [])
            .map((category: any) => category.code)
            .sort();
        const identity =
          row.code ?? row.name ?? row.label ?? String(row.order ?? row.id);
        const item: ReferenceItem = {
          kind,
          key: String(identity).slice(0, 170),
          active: true,
          values,
          links: {},
        };
        if (Object.hasOwn(values, 'is_active'))
          item.active = !!values.is_active;
        if (Object.hasOwn(values, 'isActive')) item.active = !!values.isActive;
        if (kind === 'permissions') {
          item.active = !RESERVED_PERMISSIONS.includes(item.key);
          values.status = 1;
        }
        byLocal.set(kind + '/' + row.id, item);
        pending.push({ item, row, kind });
      }
    }
    // Resolve references from either explicit foreign-key columns or relation objects.
    for (const { item, row, kind } of pending) {
      for (const [field, targetKind] of Object.entries(
        this.registry.relationFields(kind),
      )) {
        let id = row[field];
        if (id === undefined) {
          const rel = this.registry
            .metadata(kind)
            .relations.find((r) =>
              r.joinColumns.some((c) => c.propertyName === field),
            );
          id = rel ? row[rel.propertyName]?.id : undefined;
        }
        const target = id != null ? byLocal.get(targetKind + '/' + id) : null;
        if (target) item.links[field] = { kind: target.kind, key: target.key };
      }
    }
    // Stable parent-qualified keys never depend on generated numeric IDs or UUIDs.
    const sourceRows = new Map(pending.map((p) => [p.item, p]));
    const qualified = new Set<ReferenceItem>();
    const qualify = (item: ReferenceItem): string => {
      if (qualified.has(item)) return item.key;
      const source = sourceRows.get(item)!;
      if (
        [
          'stages',
          'sub_stages',
          'transitions',
          'cycles',
          'stage_configs',
        ].includes(item.kind)
      ) {
        const relations = this.registry.relationFields(item.kind),
          identities: Record<string, string> = {};
        for (const [field, targetKind] of Object.entries(relations)) {
          const target = byLocal.get(targetKind + '/' + source.row[field]);
          if (target) identities[field] = qualify(target);
        }
        item.key =
          item.kind +
          ':' +
          fingerprint({
            name: source.row.name ?? source.row.label ?? null,
            order: source.row.order ?? null,
            relations: identities,
          }).slice(0, 40);
      }
      qualified.add(item);
      return item.key;
    };
    pending.forEach((p) => qualify(p.item));
    // Rewrite links after qualification using the captured source identities.
    for (const { item, row, kind } of pending) {
      for (const [field, targetKind] of Object.entries(
        this.registry.relationFields(kind),
      )) {
        let id = row[field];
        if (id === undefined) {
          const rel = this.registry
            .metadata(kind)
            .relations.find((r) =>
              r.joinColumns.some((c) => c.propertyName === field),
            );
          id = rel ? row[rel.propertyName]?.id : undefined;
        }
        const target = byLocal.get(targetKind + '/' + id);
        if (target) item.links[field] = { kind: target.kind, key: target.key };
      }
      items.push(item);
    }
    for (const role of ROLES_CONFIG)
      items.push({
        kind: 'roles',
        key: role.code,
        active: true,
        links: {},
        values: {
          code: role.code,
          name: role.name,
          description: role.description,
          isSystemRole: role.isSystemRole,
          status: 1,
          base_role: role.code,
          permissions: role.permissions.filter(
            (p) => !RESERVED_PERMISSIONS.includes(p),
          ),
        },
      });
    for (const currency of CURRENCIES)
      items.push({
        kind: 'currencies',
        key: currency.code,
        active: true,
        links: {},
        values: { ...currency },
      });
    const values: Record<string, any> = {};
    for (const c of this.registry.db.getMetadata(Cabinet).columns)
      if (
        INITIAL_SETTING_FIELDS.includes(c.propertyName) &&
        c.default !== undefined &&
        typeof c.default !== 'function'
      )
        values[c.propertyName] = c.default;
    Object.assign(values, {
      currency: 'XAF',
      currency_symbol: 'FCFA',
      currency_symbol_position: 'after',
      currency_decimals: 0,
      currency_thousands_sep: ' ',
      currency_decimal_sep: ',',
    });
    for (const [key, value] of Object.entries(values))
      items.push({
        kind: 'settings',
        key,
        active: true,
        links: {},
        values: { [key]: value },
      });
    this.logger.log(
      'Profil initial capturé : ' +
        items.length +
        ' éléments, aucune donnée cabinet consultée.',
    );
    return items;
  }
}
