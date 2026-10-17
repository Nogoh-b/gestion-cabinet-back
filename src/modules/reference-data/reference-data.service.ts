import { PERMISSION_DEFINITIONS } from 'src/core/auth/seeders/permission.seeder';
import { PlatformAuditContext } from '../platform/audit/platform-audit.context';
import { CURRENCIES } from './legacy-currencies';
import { Conversation as ChatConversation } from '../chat/entities/conversation.entity';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { ReferenceBootstrap } from './reference-bootstrap';
import { ReferenceAdapter } from './reference-adapter';
import { ReferenceRegistry } from './reference-registry';
import { ReferenceItem, itemId, fingerprint } from './reference-data.types';
import {
  ReferenceProfile,
  ReferenceRevision,
  ReferenceProvenance,
  ReferenceDeployment,
  ReferenceDeploymentTarget,
  ReferenceTenantBinding,
} from './entities/reference-data.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';

export const STANDARD_PROFILE_ID = '8e895d44-7ed0-4e54-8798-000000000001';
export const BASELINE_REVISION_ID = '8e895d44-7ed0-4e54-8798-000000000002';
@Injectable()
export class ReferenceDataService implements OnApplicationBootstrap {
  private initializing: Promise<ReferenceProfile> | null = null;
  constructor(
    readonly db: DataSource,
    readonly registry: ReferenceRegistry,
    readonly adapter: ReferenceAdapter,
    private readonly bootstrap: ReferenceBootstrap,
    private readonly tenant: TenantContext,
  ) {}
  async onApplicationBootstrap() {
    await this.ensureStandard();
  }
  async ensureStandard(
    em: EntityManager = this.db.manager,
  ): Promise<ReferenceProfile> {
    const existing = await em.findOneBy(ReferenceProfile, {
      id: STANDARD_PROFILE_ID,
    });
    if (existing) return existing;
    if (em === this.db.manager && this.initializing) return this.initializing;
    const create = async (manager: EntityManager) => {
      const found = await manager.findOneBy(ReferenceProfile, {
        id: STANDARD_PROFILE_ID,
      });
      if (found) return found;
      const content = await this.bootstrap.capture();
      const known = new Set(
        content.filter((i) => i.kind === 'permissions').map((i) => i.key),
      );
      for (const role of content.filter((i) => i.kind === 'roles'))
        role.values.permissions = role.values.permissions.filter((p: string) =>
          known.has(p),
        );
      const errors = this.registry.validate(content, known);
      if (errors.length)
        throw new BadRequestException({
          message: 'Profil initial invalide',
          errors,
        });
      await manager
        .createQueryBuilder()
        .insert()
        .into(ReferenceRevision)
        .values({
          id: BASELINE_REVISION_ID,
          profile_id: STANDARD_PROFILE_ID,
          number: 1,
          status: 'published',
          content,
          created_by: null,
          published_by: null,
          published_at: new Date(),
        })
        .orIgnore()
        .execute();
      await manager
        .createQueryBuilder()
        .insert()
        .into(ReferenceProfile)
        .values({
          id: STANDARD_PROFILE_ID,
          name: 'Standard — Cameroun',
          description: 'Configuration initiale issue des référentiels livrés.',
          is_default: true,
          is_active: true,
          published_revision_id: BASELINE_REVISION_ID,
        })
        .orIgnore()
        .execute();
      // Adopt only exact matches. Unknown and customized records remain untracked.
      for (const cabinet of await manager.find(Cabinet, { select: ['id'] })) {
        const snapshot = await this.adapter.snapshot(
          cabinet.id,
          content,
          manager,
        );
        for (const change of this.adapter.changes(content, snapshot)) {
          if (
            change.action !== 'unchanged' ||
            !change.before ||
            snapshot.provenance.has(itemId(change.item))
          )
            continue;
          await manager
            .createQueryBuilder()
            .insert()
            .into(ReferenceProvenance)
            .values({
              id: randomUUID(),
              cabinet_id: cabinet.id,
              kind: change.item.kind,
              item_key: change.item.key,
              local_id: change.local_id,
              revision_id: BASELINE_REVISION_ID,
              applied: change.item,
            })
            .orIgnore()
            .execute();
        }
      }
      return manager.findOneByOrFail(ReferenceProfile, {
        id: STANDARD_PROFILE_ID,
      });
    };
    if (em !== this.db.manager) return create(em);
    this.initializing = this.db.transaction(create);
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  async knownPermissions(em: EntityManager = this.db.manager) {
    return new Set(PERMISSION_DEFINITIONS.map((permission) => permission.code));
  }
  async list() {
    await this.ensureStandard();
    return this.db
      .getRepository(ReferenceProfile)
      .find({ order: { is_default: 'DESC', name: 'ASC' } });
  }
  async detail(id: string) {
    const profile = await this.db.manager.findOneByOrFail(ReferenceProfile, {
      id,
    });
    const revisions = await this.db
      .getRepository(ReferenceRevision)
      .find({ where: { profile_id: id }, order: { number: 'DESC' } });
    const current = revisions.find(
      (r) =>
        r.id === (profile.draft_revision_id ?? profile.published_revision_id),
    );
    if (!current)
      throw new BadRequestException('Le profil ne contient aucune version.');
    return {
      profile,
      revisions: revisions.map(({ content, ...r }) => ({
        ...r,
        count: content.length,
      })),
      technical_permissions: PERMISSION_DEFINITIONS.map((p) => ({
        kind: 'permissions',
        key: p.code,
        active: ![
          'SUPER_ADMIN',
          'AUDIT_SYSTEM',
          'manage_cabinets',
          'view_plans',
          'create_plan',
          'edit_plan',
          'delete_plan',
        ].includes(p.code),
        links: {},
        values: { ...p, canChange: p.canChange ?? 1, status: 1 },
      })),
      current,
      schema: this.registry.schema(),
    };
  }
  async draftChanges(profileId: string) {
    const { profile, current } = await this.detail(profileId);
    const published = profile.published_revision_id
      ? await this.db.manager.findOneByOrFail(ReferenceRevision, {
          id: profile.published_revision_id,
        })
      : null;
    const previous = new Map(
      (published?.content ?? []).map((item) => [itemId(item), item]),
    );
    const changes = current.content
      .filter(
        (item) =>
          fingerprint(previous.get(itemId(item)) ?? null) !== fingerprint(item),
      )
      .map((item) => ({
        before: previous.get(itemId(item)) ?? null,
        after: item,
      }));
    return {
      base_revision_id: published?.id ?? null,
      current_revision_id: current.id,
      changes,
    };
  }
  async create(name: string, sourceId: string | undefined, adminId: number) {
    await this.ensureStandard();
    const source = await this.db.manager.findOneByOrFail(ReferenceProfile, {
      id: sourceId ?? STANDARD_PROFILE_ID,
    });
    const revision = await this.db.manager.findOneByOrFail(ReferenceRevision, {
      id: source.draft_revision_id ?? source.published_revision_id!,
    });
    return this.db.transaction(async (em) => {
      const profile = await em.save(ReferenceProfile, {
        name: name.trim(),
        description: source.description,
        is_default: false,
        is_active: true,
      });
      const draft = await em.save(ReferenceRevision, {
        profile_id: profile.id,
        number: 1,
        status: 'draft',
        content: revision.content,
        created_by: adminId,
      });
      profile.draft_revision_id = draft.id;
      return em.save(ReferenceProfile, profile);
    });
  }
  async ensureDraft(
    profileId: string,
    adminId: number,
    sourceRevisionId?: string,
    manager?: EntityManager,
  ): Promise<ReferenceRevision> {
    const operation = async (em: EntityManager) => {
      const profile = await em.findOneOrFail(ReferenceProfile, {
        where: { id: profileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (profile.draft_revision_id && !sourceRevisionId)
        return em.findOneByOrFail(ReferenceRevision, {
          id: profile.draft_revision_id,
        });
      const sourceId = sourceRevisionId ?? profile.published_revision_id;
      if (!sourceId) throw new BadRequestException('Version source absente');
      const source = await em.findOneByOrFail(ReferenceRevision, {
        id: sourceId,
        profile_id: profileId,
      });
      if (sourceRevisionId && profile.draft_revision_id)
        throw new ConflictException(
          'Un brouillon existe déjà. Publiez-le ou supprimez-le avant de restaurer une version.',
        );
      const latest = await em.getRepository(ReferenceRevision).findOne({
        where: { profile_id: profileId },
        order: { number: 'DESC' },
      });
      const draft = await em.save(ReferenceRevision, {
        profile_id: profileId,
        number: (latest?.number ?? 0) + 1,
        status: 'draft',
        content: source.content,
        created_by: adminId,
      });
      profile.draft_revision_id = draft.id;
      await em.save(ReferenceProfile, profile);
      return draft;
    };
    return manager ? operation(manager) : this.db.transaction(operation);
  }
  async validateChanges(
    previous: ReferenceItem[],
    content: ReferenceItem[],
    em: EntityManager = this.db.manager,
  ) {
    const errors = this.registry.validate(
      content,
      await this.knownPermissions(em),
    );
    if (errors.length) return errors;
    for (const item of content.filter((item) => item.kind === 'roles')) {
      const before = previous.find((entry) => itemId(entry) === itemId(item));
      if (before && before.values.base_role !== item.values.base_role)
        errors.push(
          'La catégorie métier du rôle ' +
            item.key +
            ' ne peut pas être modifiée.',
        );
    }
    return errors;
  }
  async saveItem(
    profileId: string,
    item: ReferenceItem,
    expectedVersion: number,
    adminId: number,
  ) {
    return this.db.transaction(async (em) => {
      const draft = await this.ensureDraft(profileId, adminId, undefined, em);
      if (draft.lock_version !== expectedVersion)
        throw new ConflictException(
          'Le brouillon a changé. Actualisez avant d’enregistrer.',
        );
      const before = draft.content.find((i) => itemId(i) === itemId(item));
      const content = draft.content
        .filter((i) => itemId(i) !== itemId(item))
        .concat(item);
      const errors = await this.validateChanges(draft.content, content, em);
      if (errors.length)
        throw new BadRequestException({ message: errors.slice(0, 8), errors });
      PlatformAuditContext.set({
        targetId: profileId,
        before: { revision_id: draft.id, item: before ?? null },
        after: { revision_id: draft.id, item },
        summary: 'Référentiel ' + itemId(item) + ' modifié dans le brouillon',
      });
      draft.content = content;
      return em.save(ReferenceRevision, draft);
    });
  }
  async saveRolePermissions(
    profileId: string,
    assignments: Array<{ role_key: string; permissions: string[] }>,
    expectedRevisionId: string,
    expectedVersion: number,
    adminId: number,
  ) {
    return this.db.transaction(async (em) => {
      const profile = await em.findOneOrFail(ReferenceProfile, {
        where: { id: profileId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = await em.findOneByOrFail(ReferenceRevision, {
        id: profile.draft_revision_id ?? profile.published_revision_id!,
      });
      if (
        current.id !== expectedRevisionId ||
        current.lock_version !== expectedVersion
      )
        throw new ConflictException(
          'Les attributions ont changé. Actualisez la page avant d’enregistrer.',
        );
      if (!profile.is_active)
        throw new BadRequestException('Ce profil est archivé.');
      const roleKeys = new Set<string>();
      for (const assignment of assignments) {
        if (roleKeys.has(assignment.role_key))
          throw new BadRequestException('Rôle fourni plusieurs fois.');
        roleKeys.add(assignment.role_key);
        if (
          !current.content.some(
            (item) => item.kind === 'roles' && item.key === assignment.role_key,
          )
        )
          throw new BadRequestException(
            'Rôle inconnu : ' + assignment.role_key,
          );
      }
      const draft = await this.ensureDraft(profileId, adminId, undefined, em);
      const before = draft.content.filter(
        (item) => item.kind === 'roles' && roleKeys.has(item.key),
      );
      const content = draft.content.map((item) => {
        const assignment =
          item.kind === 'roles' &&
          assignments.find((entry) => entry.role_key === item.key);
        return assignment
          ? {
              ...item,
              values: {
                ...item.values,
                permissions: [...new Set(assignment.permissions)].sort(),
              },
            }
          : item;
      });
      const errors = await this.validateChanges(draft.content, content, em);
      if (errors.length)
        throw new BadRequestException({ message: errors.slice(0, 8), errors });
      PlatformAuditContext.set({
        targetId: profileId,
        before: { revision_id: current.id, items: before },
        after: {
          revision_id: draft.id,
          items: content.filter(
            (item) => item.kind === 'roles' && roleKeys.has(item.key),
          ),
        },
        summary: 'Attributions initiales des permissions aux rôles modifiées',
      });
      draft.content = content;
      return em.save(ReferenceRevision, draft);
    });
  }
  async validate(profileId: string) {
    const detail = await this.detail(profileId);
    return {
      errors: this.registry.validate(
        detail.current?.content ?? [],
        await this.knownPermissions(),
      ),
    };
  }
  async publish(profileId: string, expectedVersion: number, adminId: number) {
    return this.db.transaction(async (em) => {
      const profile = await em.findOneOrFail(ReferenceProfile, {
        where: { id: profileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile.is_active || !profile.draft_revision_id)
        throw new BadRequestException('Aucun brouillon actif à publier.');
      const draft = await em.findOneByOrFail(ReferenceRevision, {
        id: profile.draft_revision_id,
      });
      if (draft.lock_version !== expectedVersion)
        throw new ConflictException('Le brouillon a changé.');
      const errors = this.registry.validate(
        draft.content,
        await this.knownPermissions(em),
      );
      if (errors.length)
        throw new BadRequestException({ message: errors.slice(0, 8), errors });
      PlatformAuditContext.set({
        targetId: profileId,
        before: { revision_id: profile.published_revision_id },
        after: {
          revision_id: draft.id,
          number: draft.number,
          count: draft.content.length,
        },
        summary: 'Version de référentiels publiée',
      });
      draft.status = 'published';
      draft.published_by = adminId;
      draft.published_at = new Date();
      await em.save(ReferenceRevision, draft);
      profile.published_revision_id = draft.id;
      profile.draft_revision_id = null;
      await em.save(ReferenceProfile, profile);
      return draft;
    });
  }
  async setDefault(id: string) {
    return this.db.transaction(async (em) => {
      await em.findOneOrFail(ReferenceProfile, {
        where: { id: STANDARD_PROFILE_ID },
        lock: { mode: 'pessimistic_write' },
      });
      const profile = await em.findOneByOrFail(ReferenceProfile, { id });
      if (!profile.is_active || !profile.published_revision_id)
        throw new BadRequestException(
          'Publiez le profil avant de le définir par défaut.',
        );
      await em.update(
        ReferenceProfile,
        { is_default: true },
        { is_default: false },
      );
      PlatformAuditContext.set({
        targetId: id,
        before: { is_default: profile.is_default },
        after: { is_default: true },
        summary: 'Profil par défaut modifié',
      });
      profile.is_default = true;
      return em.save(ReferenceProfile, profile);
    });
  }
  async archive(id: string) {
    const profile = await this.db.manager.findOneByOrFail(ReferenceProfile, {
      id,
    });
    if (profile.is_default)
      throw new BadRequestException(
        'Choisissez d’abord un autre profil par défaut.',
      );
    PlatformAuditContext.set({
      targetId: id,
      before: { is_active: profile.is_active },
      after: { is_active: !profile.is_active },
      summary: 'Activation du profil modifiée',
    });
    profile.is_active = !profile.is_active;
    return this.db.manager.save(ReferenceProfile, profile);
  }
  async discardDraft(id: string) {
    return this.db.transaction(async (em) => {
      const profile = await em.findOneOrFail(ReferenceProfile, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile.published_revision_id)
        throw new BadRequestException('Le profil doit conserver une version.');
      if (profile.draft_revision_id)
        await em.delete(ReferenceRevision, {
          id: profile.draft_revision_id,
          status: 'draft',
        });
      profile.draft_revision_id = null;
      return em.save(ReferenceProfile, profile);
    });
  }
  async preview(revisionId: string, cabinetIds: number[], adminId: number) {
    const revision = await this.db.manager.findOneByOrFail(ReferenceRevision, {
      id: revisionId,
      status: 'published',
    });
    if (!cabinetIds.length || cabinetIds.length > 200)
      throw new BadRequestException('Sélectionnez entre 1 et 200 cabinets.');
    return this.db.transaction(async (em) => {
      const run = await em.save(ReferenceDeployment, {
        revision_id: revisionId,
        status: 'preview',
        created_by: adminId,
      });
      for (const cabinetId of [...new Set(cabinetIds)]) {
        const snapshot = await this.adapter.snapshot(
          cabinetId,
          revision.content,
          em,
        );
        const changes = this.adapter.changes(revision.content, snapshot);
        await em.save(ReferenceDeploymentTarget, {
          deployment_id: run.id,
          cabinet_id: cabinetId,
          status: 'preview',
          changes,
          overrides: [],
        });
      }
      PlatformAuditContext.set({
        targetId: run.id,
        after: { revision_id: revisionId, cabinet_ids: cabinetIds },
        summary: 'Comparaison des référentiels préparée',
      });
      return this.deployment(run.id, em);
    });
  }
  async enqueue(id: string, overrides: Record<string, string[]>) {
    return this.db.transaction(async (em) => {
      const run = await em.findOneOrFail(ReferenceDeployment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (run.status !== 'preview')
        throw new ConflictException('Cette application est déjà lancée.');
      const revision = await em.findOneByOrFail(ReferenceRevision, {
        id: run.revision_id,
        status: 'published',
      });
      const targets = await em.findBy(ReferenceDeploymentTarget, {
        deployment_id: id,
      });
      for (const target of targets) {
        const latest = this.adapter.changes(
          revision.content,
          await this.adapter.snapshot(target.cabinet_id, revision.content, em),
        );
        if (
          fingerprint(latest.map((c) => c.fingerprint)) !==
          fingerprint(target.changes.map((c) => c.fingerprint))
        )
          throw new ConflictException(
            'La configuration du cabinet ' +
              target.cabinet_id +
              ' a changé. Recalculez l’aperçu.',
          );
        target.overrides = overrides[String(target.cabinet_id)] ?? [];
        const allowed = new Set(
          target.changes
            .filter((c) => c.action === 'conflict')
            .map((c) => itemId(c.item)),
        );
        if (target.overrides.some((key) => !allowed.has(key)))
          throw new BadRequestException('Remplacement inconnu.');
        this.adapter.validateOverrides(target.changes, target.overrides);
        target.status = 'pending';
        await em.save(ReferenceDeploymentTarget, target);
      }
      PlatformAuditContext.set({
        targetId: id,
        before: { status: run.status },
        after: { status: 'pending', revision_id: run.revision_id, overrides },
        summary: 'Application des référentiels demandée',
      });
      run.status = 'pending';
      await em.save(ReferenceDeployment, run);
      return this.deployment(id, em);
    });
  }
  async deployments() {
    return this.db
      .getRepository(ReferenceDeployment)
      .find({ order: { created_at: 'DESC' }, take: 50 });
  }
  async deployment(id: string, em: EntityManager = this.db.manager) {
    const run = await em.findOneByOrFail(ReferenceDeployment, { id });
    const targets = await em.findBy(ReferenceDeploymentTarget, {
      deployment_id: id,
    });
    return { ...run, targets };
  }
  async retry(id: string, adminId: number) {
    const run = await this.deployment(id);
    const ids = run.targets
      .filter((t) => t.status === 'failed')
      .map((t) => t.cabinet_id);
    if (!ids.length) throw new BadRequestException('Aucun cabinet en échec.');
    return this.preview(run.revision_id, ids, adminId);
  }
  async initializeCabinet(
    cabinetId: number,
    profileId?: string,
    manager?: EntityManager,
  ) {
    const operation = async (em: EntityManager) => {
      await this.ensureStandard(em);
      if (await em.findOneBy(ReferenceTenantBinding, { cabinet_id: cabinetId }))
        return;
      const profile = profileId
        ? await em.findOneByOrFail(ReferenceProfile, {
            id: profileId,
            is_active: true,
          })
        : await em.findOneByOrFail(ReferenceProfile, {
            is_default: true,
            is_active: true,
          });
      if (!profile.published_revision_id)
        throw new BadRequestException('Le profil choisi n’est pas publié.');
      const revision = await em.findOneByOrFail(ReferenceRevision, {
        id: profile.published_revision_id,
        status: 'published',
      });
      const snapshot = await this.adapter.snapshot(
        cabinetId,
        revision.content,
        em,
      );
      const changes = this.adapter.changes(revision.content, snapshot);
      // A new cabinet has only database defaults; these may be replaced safely.
      await this.adapter.apply(
        cabinetId,
        revision.id,
        revision.content,
        changes,
        changes
          .filter((c) => c.action === 'conflict')
          .map((c) => itemId(c.item)),
        em,
      );
      const cabinet = await em.findOneByOrFail(Cabinet, { id: cabinetId });
      if (
        !(await em.findOneBy(ChatConversation, {
          tenant_id: cabinetId,
          name: cabinet.default_chat_group_name,
          isGroup: true,
        }))
      )
        await em.save(ChatConversation, {
          tenant_id: cabinetId,
          name: cabinet.default_chat_group_name,
          isGroup: true,
          participants: [],
        });
    };
    return this.tenant.run(cabinetId, () =>
      manager ? operation(manager) : this.db.transaction(operation),
    );
  }
  async initialSettings(cabinetId: number) {
    const binding = await this.db.manager.findOneBy(ReferenceTenantBinding, {
      cabinet_id: cabinetId,
    });
    const revision = await this.db.manager.findOneByOrFail(ReferenceRevision, {
      id: binding?.revision_id ?? BASELINE_REVISION_ID,
    });
    return Object.assign(
      {},
      ...revision.content
        .filter((i) => i.kind === 'settings' && i.active)
        .map((i) => i.values),
    );
  }
  async effective(cabinetId: number) {
    const binding = await this.db.manager.findOneBy(ReferenceTenantBinding, {
      cabinet_id: cabinetId,
    });
    return {
      binding,
      currencies: (binding?.currencies ?? CURRENCIES).filter(
        (currency: any) => currency.active !== false,
      ),
      roles: await this.db
        .getRepository(this.registry.metadata('roles').target)
        .createQueryBuilder('r')
        .where('r.tenant_id=:tenant AND r.status=1', { tenant: cabinetId })
        .getMany(),
    };
  }
}
