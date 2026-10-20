import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReferenceRegistry, RESERVED_PERMISSIONS } from './reference-registry';
import {
  ReferenceItem,
  ReferenceChange,
  fingerprint,
  itemId,
  orderItems,
} from './reference-data.types';
import {
  ReferenceProvenance,
  ReferenceTenantBinding,
  ReferenceRevision,
} from './entities/reference-data.entity';
import { RolePermission } from '../iam/role-permission/entities/role-permission.entity';
import { User } from '../iam/user/entities/user.entity';
import { UserRoleAssignment } from '../iam/user-role-assignment/entities/user-role-assignment.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { CURRENCIES } from './legacy-currencies';

export interface ReferenceSnapshot {
  rows: Map<string, any[]>;
  provenance: Map<string, ReferenceProvenance>;
  local: Map<string, any>;
  normalized: Map<string, ReferenceItem | null>;
  cabinet: Cabinet;
  binding: ReferenceTenantBinding | null;
}
@Injectable()
export class ReferenceAdapter {
  constructor(
    private readonly registry: ReferenceRegistry,
    private readonly db: DataSource,
  ) {}
  async snapshot(
    cabinetId: number,
    items: ReferenceItem[],
    em: EntityManager,
    lock = false,
  ): Promise<ReferenceSnapshot> {
    const cabinet = await em.getRepository(Cabinet).findOne({
      where: { id: cabinetId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!cabinet)
      throw new BadRequestException('Cabinet introuvable : ' + cabinetId);
    const binding = await em.findOneBy(ReferenceTenantBinding, {
      cabinet_id: cabinetId,
    });
    const provenance = new Map(
      (await em.findBy(ReferenceProvenance, { cabinet_id: cabinetId })).map(
        (p) => [p.kind + '/' + p.item_key, p],
      ),
    );
    const rows = new Map<string, any[]>(),
      local = new Map<string, any>(),
      normalized = new Map<string, ReferenceItem | null>();
    for (const kind of new Set(items.map((i) => i.kind))) {
      if (['settings', 'currencies'].includes(kind)) continue;
      const meta = this.registry.metadata(kind);
      const query = em
        .getRepository(meta.target)
        .createQueryBuilder('r')
        .withDeleted()
        .where('r.tenant_id = :tenant', { tenant: cabinetId });
      if (lock) query.setLock('pessimistic_write');
      if (kind === 'document_types')
        query.leftJoinAndSelect(
          'r.categories',
          'category',
          'category.tenant_id=:tenant',
          { tenant: cabinetId },
        );
      rows.set(kind, await query.getMany());
    }
    const roleQuery = em
      .getRepository(RolePermission)
      .createQueryBuilder('rp')
      .where('rp.tenant_id = :tenant', { tenant: cabinetId });
    if (lock) roleQuery.setLock('pessimistic_write');
    const roleLinks = await roleQuery.getMany();
    const permissionRows = rows.get('permissions') ?? [];
    const permissionCodes = new Map(permissionRows.map((p) => [p.id, p.code]));
    const localKeys = new Map<string, string>();
    for (const item of orderItems(items)) {
      const id = itemId(item),
        source = provenance.get(id);
      if (item.kind === 'currencies') {
        const currency = (binding?.currencies ?? CURRENCIES).find(
          (c) => c.code === item.key,
        );
        const current = currency
          ? {
              ...item,
              active: (currency as any).active !== false,
              values: Object.fromEntries(
                Object.keys(item.values).map((k) => [k, currency[k]]),
              ),
            }
          : null;
        normalized.set(id, current);
        local.set(id, currency ?? null);
        continue;
      }
      if (item.kind === 'settings') {
        normalized.set(id, {
          ...item,
          active: true,
          values: Object.fromEntries(
            Object.keys(item.values).map((k) => [k, cabinet[k]]),
          ),
        });
        local.set(id, cabinet);
        continue;
      }
      const candidates = rows.get(item.kind) ?? [];
      const relations = this.registry.relationFields(item.kind);
      let row = source?.local_id
        ? candidates.find((r) => String(r.id) === source.local_id)
        : null;
      if (!source) {
        row = candidates.find((r) => {
          if (item.values.code !== undefined && r.code !== item.values.code)
            return false;
          else if (
            item.values.code === undefined &&
            item.values.name !== undefined &&
            String(r.name).replace(/ · réf [a-f0-9-]+$/, '') !==
              item.values.name
          )
            return false;
          else if (
            item.values.code === undefined &&
            item.values.name === undefined &&
            item.values.label !== undefined &&
            r.label !== item.values.label
          )
            return false;
          for (const [field, link] of Object.entries(item.links)) {
            const target = local.get(itemId(link));
            if (!target || String(r[field]) !== String(target.id)) return false;
          }
          if (item.values.order !== undefined && r.order !== item.values.order)
            return false;
          if (
            !item.values.code &&
            !item.values.name &&
            !item.values.label &&
            !Object.keys(item.links).length
          )
            return false;
          return true;
        });
      }
      if (!source && !row && item.kind === 'case_workflow_features') {
        // Ligne unique par cabinet (UQ_case_workflow_feature_tenant), sans
        // code ni libellé : rattacher la ligne locale pour comparer plutôt
        // que créer un doublon. Une valeur locale différente devient un
        // conflit, préservé par défaut.
        row = candidates.find((r) => !r.deleted_at) ?? null;
      }
      local.set(id, row ?? null);
      if (row) localKeys.set(item.kind + '/' + row.id, item.key);
      if (!row || row.deleted_at) {
        normalized.set(id, null);
        continue;
      }
      const values: Record<string, any> = {};
      for (const key of Object.keys(item.values)) {
        if (key === 'permissions' && item.kind === 'roles') {
          values.permissions = roleLinks
            .filter((r) => r.role_id === row.id && r.status !== 0)
            .map((r) => permissionCodes.get(r.permission_id))
            .filter(
              (c): c is string => !!c && !RESERVED_PERMISSIONS.includes(c),
            )
            .sort();
        } else if (key === 'categories' && item.kind === 'document_types') {
          values.categories = (row.categories ?? [])
            .map((category: any) => category.code)
            .sort();
        } else {
          const column = this.registry
            .columns(item.kind)
            .find((c) => c.propertyName === key);
          let value = row[key];
          if (
            column &&
            [
              'decimal',
              'float',
              'double',
              'int',
              'tinyint',
              'smallint',
            ].includes(String(column.type)) &&
            value != null
          )
            value = Number(value);
          if (key === 'base_role' && !value) value = row.code;
          if (item.kind === 'procedure_templates' && key === 'name')
            value = String(value).replace(/ · réf [a-f0-9-]+$/, '');
          values[key] = value ?? null;
        }
      }
      const links: ReferenceItem['links'] = {};
      for (const [field, targetKind] of Object.entries(relations)) {
        if (row[field] != null) {
          const key = localKeys.get(targetKind + '/' + row[field]);
          links[field] = {
            kind: targetKind,
            key: key ?? 'local:' + String(row[field]),
          };
        }
      }
      const virtualArchive =
        [
          'stages',
          'sub_stages',
          'transitions',
          'cycles',
          'stage_configs',
        ].includes(item.kind) && source?.applied.active === false;
      const active = virtualArchive
        ? false
        : (row.is_active ??
          row.isActive ??
          (row.status == null ? true : Number(row.status) !== 0));
      normalized.set(id, { ...item, active: !!active, values, links });
    }
    return { rows, provenance, local, normalized, cabinet, binding };
  }
  comparable(item: ReferenceItem | null): any {
    if (!item) return null;
    const copy = JSON.parse(JSON.stringify(item));
    for (const field of ['status', 'is_active', 'isActive'])
      delete copy.values[field];
    if (copy.kind === 'document_types' && Array.isArray(copy.values.categories))
      copy.values.categories.sort();
    if (copy.kind === 'roles' && Array.isArray(copy.values.permissions))
      copy.values.permissions.sort();
    return copy;
  }
  changes(
    items: ReferenceItem[],
    snapshot: ReferenceSnapshot,
  ): ReferenceChange[] {
    const changes: ReferenceChange[] = orderItems(items).map((item) => {
      const id = itemId(item),
        before = snapshot.normalized.get(id) ?? null,
        source = snapshot.provenance.get(id);
      const baseline = source?.applied ?? null;
      const desired = this.comparable(item),
        current = this.comparable(before);
      const same =
        (!before && !item.active) ||
        fingerprint(desired) === fingerprint(current);
      const untouched =
        baseline &&
        fingerprint(this.comparable(baseline)) === fingerprint(current);
      const action = same
        ? 'unchanged'
        : source
          ? !untouched
            ? 'conflict'
            : item.active
              ? 'update'
              : 'disable'
          : before
            ? 'conflict'
            : item.active
              ? 'create'
              : 'unchanged';
      return {
        item,
        before,
        baseline,
        local_id:
          snapshot.local.get(id)?.id != null
            ? String(snapshot.local.get(id).id)
            : null,
        action,
        fingerprint: fingerprint(current),
        reason:
          action === 'conflict'
            ? before
              ? 'Valeur personnalisée ou origine inconnue'
              : 'Élément retiré localement'
            : undefined,
      };
    });
    for (const group of this.graphGroups(changes)) {
      if (group.some((c) => c.action === 'conflict')) {
        for (const change of group) {
          change.action = 'conflict';
          change.reason =
            'Cette procédure contient des personnalisations. Le graphe complet est conservé par défaut.';
        }
      } else if (group.some((c) => c.action !== 'unchanged')) {
        const root = group.find((c) => c.item.kind === 'procedure_templates');
        if (root?.before && root.item.active && root.action === 'unchanged') {
          root.action = 'update';
          root.reason = 'Nouvelle version du graphe de procédure.';
        }
      }
    }
    return changes;
  }

  graphGroups(changes: ReferenceChange[]): ReferenceChange[][] {
    const byId = new Map(changes.map((c) => [itemId(c.item), c.item]));
    const root = (item: ReferenceItem): string | null => {
      if (item.kind === 'procedure_templates') return itemId(item);
      if (
        ![
          'stages',
          'sub_stages',
          'transitions',
          'cycles',
          'stage_configs',
        ].includes(item.kind)
      )
        return null;
      const link = item.links.templateId ?? item.links.stageId;
      const parent = link ? byId.get(itemId(link)) : null;
      return parent ? root(parent) : null;
    };
    const groups = new Map<string, ReferenceChange[]>();
    for (const change of changes) {
      const id = root(change.item);
      if (id) groups.set(id, [...(groups.get(id) ?? []), change]);
    }
    return [...groups.values()];
  }
  validateOverrides(changes: ReferenceChange[], overrides: string[]) {
    for (const group of this.graphGroups(changes)) {
      const conflicts = group.filter((c) => c.action === 'conflict');
      const selected = conflicts.filter((c) =>
        overrides.includes(itemId(c.item)),
      );
      if (selected.length && selected.length !== conflicts.length)
        throw new BadRequestException(
          'Une procédure personnalisée doit être conservée ou remplacée dans son ensemble.',
        );
    }
  }

  async apply(
    cabinetId: number,
    revisionId: string,
    items: ReferenceItem[],
    changes: ReferenceChange[],
    overrides: string[],
    em: EntityManager,
  ): Promise<Record<string, number>> {
    const snapshot = await this.snapshot(cabinetId, items, em, true),
      live = this.changes(items, snapshot);
    for (const change of changes) {
      const current = live.find((c) => itemId(c.item) === itemId(change.item));
      if (!current || current.fingerprint !== change.fingerprint)
        throw new BadRequestException(
          'Aperçu périmé : ' +
            itemId(change.item) +
            '. Recalculez la comparaison.',
        );
    }
    this.validateOverrides(live, overrides);
    const result = { created: 0, updated: 0, preserved: 0, unchanged: 0 };
    const currencies: any[] = [];
    for (const change of live) {
      const item = change.item,
        id = itemId(item),
        source = snapshot.provenance.get(id);
      const preserve = change.action === 'conflict' && !overrides.includes(id);
      if (preserve) {
        result.preserved++;
        if (item.kind === 'currencies' && change.before)
          currencies.push({
            ...change.before.values,
            active: change.before.active,
          });
        continue;
      }
      if (item.kind === 'currencies') {
        currencies.push({ ...item.values, active: item.active });
        if (change.action === 'create') result.created++;
        else if (change.action !== 'unchanged') result.updated++;
        else result.unchanged++;
      } else {
        let row = snapshot.local.get(id),
          relink = false;
        if (row)
          for (const [field, link] of Object.entries(item.links)) {
            if (
              String(row[field]) !==
              String(snapshot.local.get(itemId(link))?.id)
            )
              relink = true;
          }
        if (change.action === 'unchanged' && !relink) result.unchanged++;
        else {
          if (!item.active && row)
            await this.assertCanDisable(item, row, cabinetId, em);
          row = await this.write(
            item,
            row,
            snapshot.local,
            cabinetId,
            revisionId,
            em,
          );
          snapshot.local.set(id, row);
          if (change.action === 'create') result.created++;
          else result.updated++;
        }
      }
      const localRow = snapshot.local.get(id);
      await em.save(
        ReferenceProvenance,
        em.create(ReferenceProvenance, {
          ...(source ? { id: source.id } : {}),
          cabinet_id: cabinetId,
          kind: item.kind,
          item_key: item.key,
          local_id: localRow?.id != null ? String(localRow.id) : null,
          revision_id: revisionId,
          applied: item,
        }),
      );
    }
    // Preserve local currencies not covered by this revision.
    for (const currency of snapshot.binding?.currencies ?? [])
      if (
        !items.some((i) => i.kind === 'currencies' && i.key === currency.code)
      )
        currencies.push(currency);
    await em.save(ReferenceTenantBinding, {
      cabinet_id: cabinetId,
      profile_id: (
        await em.findOneByOrFail(ReferenceRevision, { id: revisionId })
      ).profile_id,
      revision_id: revisionId,
      currencies,
    });
    return result;
  }
  private async assertCanDisable(
    item: ReferenceItem,
    row: any,
    cabinetId: number,
    em: EntityManager,
  ) {
    if (item.kind === 'roles') {
      if (['admin', 'client'].includes(item.key))
        throw new BadRequestException('Rôle système protégé');
      const used = await em
        .getRepository(User)
        .createQueryBuilder('u')
        .where('u.tenant_id=:tenant AND u.role=:role', {
          tenant: cabinetId,
          role: item.key,
        })
        .getCount();
      const assigned = await em
        .getRepository(UserRoleAssignment)
        .createQueryBuilder('a')
        .where('a.tenant_id=:tenant AND a.role_id=:role AND a.status=1', {
          tenant: cabinetId,
          role: row.id,
        })
        .getCount();
      if (used || assigned)
        throw new BadRequestException(
          'Réaffectez les utilisateurs avant de désactiver ' + item.key,
        );
    }
  }
  private async write(
    item: ReferenceItem,
    row: any,
    local: Map<string, any>,
    cabinetId: number,
    revisionId: string,
    em: EntityManager,
  ) {
    if (item.kind === 'settings') {
      if (
        Object.hasOwn(item.values, 'default_chat_group_name') &&
        row?.default_chat_group_name !== item.values.default_chat_group_name
      ) {
        const group = await em.findOneBy(Conversation, {
          tenant_id: cabinetId,
          isGroup: true,
          name: row?.default_chat_group_name,
        });
        if (group)
          await em.update(
            Conversation,
            { id: group.id, tenant_id: cabinetId },
            { name: item.values.default_chat_group_name },
          );
      }
      await em.getRepository(Cabinet).update(cabinetId, item.values);
      return { id: cabinetId, ...item.values };
    }
    const meta = this.registry.metadata(item.kind),
      repo = em.getRepository(meta.target);
    const columns = new Set(meta.columns.map((c) => c.propertyName));
    if (!item.active) {
      if (!row) return null;
      const flag = ['is_active', 'isActive', 'status'].find((field) =>
        columns.has(field),
      );
      if (flag) {
        const disabled = { [flag]: flag === 'status' ? 0 : false };
        await repo.update(row.id, disabled);
        return { ...row, ...disabled };
      }
      if (
        [
          'stages',
          'sub_stages',
          'transitions',
          'cycles',
          'stage_configs',
        ].includes(item.kind)
      )
        return row;
      if (!meta.deleteDateColumn)
        throw new BadRequestException(
          'Archivage indisponible pour ' + item.kind,
        );
      await repo.softDelete(row.id);
      return { ...row, deleted_at: new Date() };
    }
    const values: any = { ...item.values, tenant_id: cabinetId };
    delete values.permissions;
    if (item.kind === 'document_types')
      values.categories = (item.values.categories ?? []).map((key: string) => {
        const category = local.get('document_categories/' + key);
        if (
          !category ||
          category.deleted_at ||
          (item.active && category.status === 0)
        )
          throw new BadRequestException('Catégorie absente : ' + key);
        return category;
      });
    for (const field of Object.keys(this.registry.relationFields(item.kind)))
      if (!item.links[field]) values[field] = null;
    for (const [field, link] of Object.entries(item.links)) {
      const target = local.get(itemId(link));
      if (
        !target ||
        target.deleted_at ||
        (item.active &&
          (target.status === 0 ||
            target.is_active === false ||
            target.is_active === 0 ||
            target.isActive === false))
      )
        throw new BadRequestException(
          'Dépendance indisponible : ' + itemId(link),
        );
      values[field] = target.id;
    }
    if (columns.has('is_active')) values.is_active = item.active;
    if (columns.has('isActive')) values.isActive = item.active;
    if (columns.has('status')) values.status = item.active ? 1 : 0;
    if (row?.deleted_at && item.active) values.deleted_at = null;
    if (
      row &&
      item.active &&
      ['action_definitions', 'recommendation_rules'].includes(item.kind)
    ) {
      await repo.update(row.id, { is_active: false });
      const max = await repo
        .createQueryBuilder('r')
        .withDeleted()
        .select('MAX(r.version)', 'version')
        .where('r.tenant_id=:tenant AND r.code=:code', {
          tenant: cabinetId,
          code: item.values.code,
        })
        .getRawOne();
      values.version = Number(max?.version ?? row.version ?? 1) + 1;
      row = null;
    } else if (row && item.active && item.kind === 'procedure_templates') {
      // Existing dossiers keep their original template and graph.
      await repo.update(row.id, { isActive: false });
      values.name = item.values.name + ' · réf ' + revisionId;
      values.version = Number(row.version ?? 1) + 1;
      row = null;
    } else if (
      row &&
      [
        'stages',
        'sub_stages',
        'transitions',
        'cycles',
        'stage_configs',
      ].includes(item.kind)
    ) {
      const parentField = ['templateId', 'stageId'].find(
        (f) => values[f] != null && String(values[f]) !== String(row[f]),
      );
      if (parentField) row = null;
    }
    if (!row && columns.has('version') && values.version === undefined)
      values.version = 1;
    const saved: any = await repo.save(
      repo.create({ ...row, ...values, ...(row ? { id: row.id } : {}) }),
    );
    if (item.kind === 'roles') {
      await em
        .getRepository(RolePermission)
        .createQueryBuilder()
        .delete()
        .where('tenant_id=:tenant AND role_id=:role', {
          tenant: cabinetId,
          role: saved.id,
        })
        .execute();
      for (const code of item.values.permissions ?? []) {
        const permission = local.get('permissions/' + code);
        if (
          !permission ||
          permission.deleted_at ||
          permission.status === 0 ||
          RESERVED_PERMISSIONS.includes(code)
        )
          throw new BadRequestException('Permission indisponible : ' + code);
        await em.save(RolePermission, {
          tenant_id: cabinetId,
          role_id: saved.id,
          permission_id: permission.id,
          status: 1,
        });
      }
    }
    return saved;
  }
}
