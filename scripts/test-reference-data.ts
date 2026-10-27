import { Conversation } from '../src/modules/chat/entities/conversation.entity';
import { PdfTemplate } from '../src/modules/pdf-templates/entities/pdf-template.entity';
import { TemplateBlock } from '../src/modules/template-blocks/entities/template-block.entity';
import { Stage } from '../src/modules/procedure/entities/stage.entity';
import { User } from '../src/modules/iam/user/entities/user.entity';
import { Customer } from '../src/modules/customer/customer/entities/customer.entity';
import { RolePermission } from '../src/modules/iam/role-permission/entities/role-permission.entity';
import { UserRoleAssignment } from '../src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { UserRoleAssignmentService } from '../src/modules/iam/user-role-assignment/user-role-assignment.service';
import { RolePermissionService } from '../src/modules/iam/role-permission/role-permission.service';
import { UserRolesService } from '../src/modules/iam/user-role/user-role.service';
import { UsersService } from '../src/modules/iam/user/user.service';
import { JwtStrategy } from '../src/core/auth/strategies/jwt.strategy';
import { ReferenceDataManagement1792300000000 } from '../src/migrations/1792300000000-ReferenceDataManagement';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { ReferenceRegistry } from '../src/modules/reference-data/reference-registry';
import { ReferenceBootstrap } from '../src/modules/reference-data/reference-bootstrap';
import { ReferenceAdapter } from '../src/modules/reference-data/reference-adapter';
import {
  ReferenceDataService,
  STANDARD_PROFILE_ID,
} from '../src/modules/reference-data/reference-data.service';
import { ReferenceDeploymentWorker } from '../src/modules/reference-data/reference-deployment.worker';
import {
  ReferenceProfile,
  ReferenceRevision,
  ReferenceProvenance,
} from '../src/modules/reference-data/entities/reference-data.entity';
import { TenantContext } from '../src/core/tenant/tenant.context';
import { Cabinet } from '../src/modules/cabinet/entities/cabinet.entity';
import { UserRole } from '../src/modules/iam/user-role/entities/user-role.entity';
import { ActionDefinition } from '../src/modules/case-workflow/entities/action-catalog.entity';
import { DocumentType } from '../src/modules/documents/document-type/entities/document-type.entity';
import { PlatformReferenceAiService } from '../src/modules/platform/reference-data/platform-reference-ai.service';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';

async function main() {
  Logger.overrideLogger(['error']);
  const env = require('dotenv').parse(fs.readFileSync('.env'));
  if (!['localhost', '127.0.0.1'].includes(env.DB_HOST))
    throw Error('Integration tests require a local database');
  const mysql = require('mysql2/promise');
  const options = {
    host: '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    connectTimeout: 5000,
  };
  const admin = await mysql.createConnection(options);
  const name = 'cabinet_reference_test_' + Date.now();
  if (!/^cabinet_reference_test_\d+$/.test(name))
    throw Error('Unsafe test schema');
  let db: DataSource | undefined;
  await admin.query(
    'CREATE DATABASE ' +
      name +
      ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  try {
    db = new DataSource({
      type: 'mariadb',
      ...options,
      username: options.user,
      database: name,
      entities: [process.cwd() + '/src/**/*.entity.ts'],
      synchronize: true,
      logging: false,
    });
    await db.initialize();
    const registry = new ReferenceRegistry(db),
      bootstrap = new ReferenceBootstrap(registry),
      adapter = new ReferenceAdapter(registry, db),
      tenant = new TenantContext();
    const service = new ReferenceDataService(
      db,
      registry,
      adapter,
      bootstrap,
      tenant,
    );
    const worker = new ReferenceDeploymentWorker(db, adapter, tenant);
    const log = console.log;
    console.log = () => {};
    try {
      await service.ensureStandard();
    } finally {
      console.log = log;
    }
    console.log('PASS standard bootstrap');
    const b = await service.create('Profil B', STANDARD_PROFILE_ID, 1);
    let draft = (await service.detail(b.id)).current!;
    const edit = async (kind: string, key: string, patch: any) => {
      const item = draft.content.find((i) => i.kind === kind && i.key === key)!;
      draft = await service.saveItem(
        b.id,
        { ...item, values: { ...item.values, ...patch } },
        draft.lock_version,
        1,
      );
    };
    await edit('settings', 'currency', { currency: 'EUR' });
    await edit('settings', 'currency_symbol', { currency_symbol: '€' });
    const prototype = draft.content.find(
      (i) => i.kind === 'roles' && i.key === 'avocat',
    )!;
    draft = await service.saveItem(
      b.id,
      {
        ...prototype,
        key: 'responsable_contentieux',
        values: {
          ...prototype.values,
          code: 'responsable_contentieux',
          name: 'Responsable contentieux',
          base_role: 'avocat',
          isSystemRole: false,
          permissions: ['view_dossiers', 'view_audiences'],
        },
      },
      draft.lock_version,
      1,
    );
    const assignmentRevision = draft.id,
      assignmentVersion = draft.lock_version;
    await assert.rejects(() =>
      service.saveRolePermissions(
        b.id,
        [
          {
            role_key: 'responsable_contentieux',
            permissions: ['invented_permission'],
          },
        ],
        draft.id,
        draft.lock_version,
        1,
      ),
    );
    draft = await service.saveRolePermissions(
      b.id,
      [
        {
          role_key: 'responsable_contentieux',
          permissions: ['view_dossiers', 'view_audiences', 'edit_dossier'],
        },
      ],
      draft.id,
      draft.lock_version,
      1,
    );
    await assert.rejects(
      () =>
        service.saveRolePermissions(
          b.id,
          [{ role_key: 'responsable_contentieux', permissions: [] }],
          assignmentRevision,
          assignmentVersion,
          1,
        ),
      /changé/,
    );
    console.log(
      'PASS initial role-permission assignments, validation and stale matrix rejection',
    );
    const pdf = draft.content.find((item) => item.kind === 'pdf_templates')!;
    const header = draft.content.find(
      (item) =>
        item.kind === 'template_blocks' &&
        item.values.channel === 'pdf' &&
        item.values.kind === 'header',
    )!;
    draft = await service.saveItem(
      b.id,
      {
        ...pdf,
        links: {
          ...pdf.links,
          header_block_id: { kind: header.kind, key: header.key },
        },
      },
      draft.lock_version,
      1,
    );
    await service.publish(b.id, draft.lock_version, 1);
    const ca = await db.manager.save(Cabinet, {
        code: 'refa',
        name: 'Cabinet A',
      }),
      cb = await db.manager.save(Cabinet, { code: 'refb', name: 'Cabinet B' });
    await tenant.run(999, () =>
      service.initializeCabinet(ca.id, STANDARD_PROFILE_ID),
    );
    await tenant.run(999, () => service.initializeCabinet(cb.id, b.id));
    assert.equal(
      (await db.manager.findOneByOrFail(Cabinet, { id: ca.id })).currency,
      'XAF',
    );
    assert.equal(
      (await db.manager.findOneByOrFail(Cabinet, { id: cb.id })).currency,
      'EUR',
    );
    assert.equal(await db.manager.countBy(UserRole, { tenant_id: 999 }), 0);
    assert.ok(
      await db.manager.findOneBy(UserRole, {
        tenant_id: cb.id,
        code: 'responsable_contentieux',
      }),
    );
    assert.equal(
      await db.manager.findOneBy(UserRole, {
        tenant_id: ca.id,
        code: 'responsable_contentieux',
      }),
      null,
    );
    const doc = await db
      .getRepository(DocumentType)
      .findOne({ where: { tenant_id: cb.id }, relations: ['categories'] });
    assert.ok(doc?.categories.length);
    assert.ok(doc.categories.every((c) => c.tenant_id === cb.id));
    const localPdf = await db.manager.findOneByOrFail(PdfTemplate, {
      tenant_id: cb.id,
      code: pdf.key,
    });
    const localHeader = await db.manager.findOneByOrFail(TemplateBlock, {
      tenant_id: cb.id,
      code: header.key,
    });
    assert.equal(localPdf.header_block_id, localHeader.id);
    const otherHeader = await db.manager.findOneByOrFail(TemplateBlock, {
      tenant_id: ca.id,
      code: header.key,
    });
    assert.notEqual(localPdf.header_block_id, otherHeader.id);
    const beforeCount = await db.manager.countBy(ReferenceProvenance, {
      cabinet_id: ca.id,
    });
    await service.initializeCabinet(ca.id);
    assert.equal(
      await db.manager.countBy(ReferenceProvenance, { cabinet_id: ca.id }),
      beforeCount,
    );
    console.log(
      'PASS complete initialization, two profiles, document relations, isolation and idempotence',
    );
    await db.manager.update(
      UserRole,
      { tenant_id: ca.id, code: 'avocat' },
      { name: 'Avocat personnalisé' },
    );
    let standardDraft = await service.ensureDraft(STANDARD_PROFILE_ID, 1);
    const action = standardDraft.content.find(
      (i) => i.kind === 'action_definitions',
    )!;
    const old = await db.manager.findOneByOrFail(ActionDefinition, {
      tenant_id: ca.id,
      code: action.key,
      version: 1,
    });
    standardDraft = await service.saveItem(
      STANDARD_PROFILE_ID,
      { ...action, values: { ...action.values, default_due_days: 45 } },
      standardDraft.lock_version,
      1,
    );
    const originalGroup = await db.manager.findOneByOrFail(Conversation, {
      tenant_id: ca.id,
      isGroup: true,
    });
    const groupSetting = standardDraft.content.find(
      (item) =>
        item.kind === 'settings' && item.key === 'default_chat_group_name',
    )!;
    standardDraft = await service.saveItem(
      STANDARD_PROFILE_ID,
      {
        ...groupSetting,
        values: { default_chat_group_name: 'Équipe du cabinet' },
      },
      standardDraft.lock_version,
      1,
    );
    const published = await service.publish(
      STANDARD_PROFILE_ID,
      standardDraft.lock_version,
      1,
    );
    const preview = await service.preview(published.id, [ca.id], 1);
    assert.ok(
      preview.targets[0].changes.some(
        (c) => c.item.key === 'avocat' && c.action === 'conflict',
      ),
    );
    await service.enqueue(preview.id, {});
    await worker.tick();
    const result = await service.deployment(preview.id);
    assert.equal(
      result.status,
      'completed',
      JSON.stringify(result.targets.map((t) => t.error)),
    );
    assert.equal(
      (
        await db.manager.findOneByOrFail(UserRole, {
          tenant_id: ca.id,
          code: 'avocat',
        })
      ).name,
      'Avocat personnalisé',
    );
    assert.equal(
      (await db.manager.findOneByOrFail(ActionDefinition, { id: old.id }))
        .default_due_days,
      old.default_due_days,
    );
    assert.equal(
      await db.manager.countBy(ActionDefinition, {
        tenant_id: ca.id,
        code: action.key,
      }),
      2,
    );
    assert.equal(
      (await db.manager.findOneByOrFail(Conversation, { id: originalGroup.id }))
        .name,
      'Équipe du cabinet',
    );
    assert.equal(
      await db.manager.countBy(Conversation, {
        tenant_id: ca.id,
        isGroup: true,
      }),
      1,
    );
    const replay = await service.preview(published.id, [ca.id], 1);
    assert.ok(
      replay.targets[0].changes
        .filter((c) => c.item.kind === 'action_definitions')
        .every((c) => c.action === 'unchanged'),
    );
    console.log('PASS deployment, local customization and action history');
    const stale = await service.preview(published.id, [cb.id], 1);
    await db.manager.update(Cabinet, cb.id, { date_format: 'yyyy-MM-dd' });
    await assert.rejects(() => service.enqueue(stale.id, {}), /changé|aperçu/i);
    console.log('PASS stale preview rejection');
    const current = (await service.detail(STANDARD_PROFILE_ID)).current!;
    const role = current.content.find(
      (i) => i.kind === 'roles' && i.key === 'secretaire',
    )!;
    const model = {
      invoke: async () => ({
        content: JSON.stringify({
          answer: 'Modifier la description du rôle.',
          changes: [
            {
              kind: 'roles',
              key: 'secretaire',
              values: { description: 'Description proposée' },
            },
          ],
          warnings: [],
          references: ['roles/secretaire'],
        }),
      }),
    };
    const ai = new PlatformReferenceAiService(db, service, {
      getPlatformModel: async () => model,
    } as any);
    const owner = { id: 1, role: 'owner' } as any;
    const reply = await ai.ask(
      STANDARD_PROFILE_ID,
      'Change la description du secrétaire',
      owner,
      'roles',
    );
    assert.ok(reply.proposal);
    assert.equal(
      (
        await db.manager.findOneByOrFail(ReferenceProfile, {
          id: STANDARD_PROFILE_ID,
        })
      ).draft_revision_id,
      null,
    );
    await ai.accept(reply.proposal!.id, 1);
    assert.equal(
      (await service.detail(STANDARD_PROFILE_ID)).current.content.find(
        (i) => i.kind === 'roles' && i.key === 'secretaire',
      )!.values.description,
      'Description proposée',
    );
    await assert.rejects(() => ai.accept(reply.proposal!.id, 1));
    const support = await ai.ask(
      STANDARD_PROFILE_ID,
      'Explique le rôle',
      { id: 2, role: 'support' } as any,
      'roles',
    );
    assert.equal(support.proposal, null);
    console.log(
      'PASS AI proposal isolation, explicit acceptance, replay rejection and support read-only',
    );

    await service.discardDraft(STANDARD_PROFILE_ID);
    const partial = await service.preview(published.id, [ca.id, cb.id], 1);
    await service.enqueue(partial.id, {});
    await db.manager.update(Cabinet, ca.id, { date_format: 'yyyy/MM/dd' });
    await worker.tick();
    await worker.tick();
    const partialResult = await service.deployment(partial.id);
    assert.equal(partialResult.status, 'failed');
    assert.equal(
      partialResult.targets.filter((t) => t.status === 'failed').length,
      1,
    );
    assert.equal(
      partialResult.targets.filter((t) => t.status === 'completed').length,
      1,
    );
    const retry = await service.retry(partial.id, 1);
    assert.equal(retry.targets.length, 1);
    await service.enqueue(retry.id, {});
    await new ReferenceDeploymentWorker(db, adapter, tenant).tick();
    assert.equal((await service.deployment(retry.id)).status, 'completed');
    console.log(
      'PASS failure isolation, recomparison and durable worker restart',
    );

    let graphDraft = await service.ensureDraft(STANDARD_PROFILE_ID, 1);
    const step = graphDraft.content.find((i) => i.kind === 'stages')!;
    const templateKey = step.links.templateId.key;
    const graphBefore = await adapter.snapshot(
      ca.id,
      graphDraft.content,
      db.manager,
    );
    const originalStep = graphBefore.local.get('stages/' + step.key);
    const originalTemplate = graphBefore.local.get(
      'procedure_templates/' + templateKey,
    );
    graphDraft = await service.saveItem(
      STANDARD_PROFILE_ID,
      {
        ...step,
        values: { ...step.values, name: 'Étape révisée depuis la plateforme' },
      },
      graphDraft.lock_version,
      1,
    );
    const graphPublished = await service.publish(
      STANDARD_PROFILE_ID,
      graphDraft.lock_version,
      1,
    );
    const graphPreview = await service.preview(graphPublished.id, [ca.id], 1);
    await service.enqueue(graphPreview.id, {});
    await worker.tick();
    const graphResult = await service.deployment(graphPreview.id);
    assert.equal(
      graphResult.status,
      'completed',
      graphResult.targets[0].error ?? '',
    );
    const graphAfter = await adapter.snapshot(
      ca.id,
      graphPublished.content,
      db.manager,
    );
    assert.notEqual(
      graphAfter.local.get('stages/' + step.key).id,
      originalStep.id,
    );
    assert.notEqual(
      graphAfter.local.get('procedure_templates/' + templateKey).id,
      originalTemplate.id,
    );
    assert.equal(
      (await db.manager.findOneByOrFail(Stage, { id: originalStep.id })).name,
      originalStep.name,
    );
    console.log(
      'PASS procedure graph revision preserves historical stage identifiers',
    );

    let failDraft = await service.ensureDraft(STANDARD_PROFILE_ID, 1);
    const failAction = failDraft.content.find(
      (i) => i.kind === 'action_definitions' && i.key === action.key,
    )!;
    failDraft = await service.saveItem(
      STANDARD_PROFILE_ID,
      { ...failAction, values: { ...failAction.values, default_due_days: 46 } },
      failDraft.lock_version,
      1,
    );
    const failPublished = await service.publish(
      STANDARD_PROFILE_ID,
      failDraft.lock_version,
      1,
    );
    const rollbackPreview = await service.preview(failPublished.id, [ca.id], 1);
    await service.enqueue(rollbackPreview.id, {});
    const actionCount = await db.manager.countBy(ActionDefinition, {
      tenant_id: ca.id,
      code: action.key,
    });
    await db.query(
      "CREATE TRIGGER reference_test_failure BEFORE UPDATE ON reference_provenance FOR EACH ROW BEGIN IF NEW.kind = 'action_definitions' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expected integration rollback'; END IF; END",
    );
    await worker.tick();
    assert.equal(
      (await service.deployment(rollbackPreview.id)).status,
      'failed',
    );
    assert.equal(
      await db.manager.countBy(ActionDefinition, {
        tenant_id: ca.id,
        code: action.key,
      }),
      actionCount,
    );
    await db.query('DROP TRIGGER reference_test_failure');
    const recover = await service.retry(rollbackPreview.id, 1);
    await service.enqueue(recover.id, {});
    await new ReferenceDeploymentWorker(db, adapter, tenant).tick();
    assert.equal((await service.deployment(recover.id)).status, 'completed');
    assert.equal(
      await db.manager.countBy(ActionDefinition, {
        tenant_id: ca.id,
        code: action.key,
      }),
      actionCount + 1,
    );
    console.log('PASS mid-transaction failure rollback and safe retry');

    const customRole = await db.manager.findOneByOrFail(UserRole, {
      tenant_id: cb.id,
      code: 'responsable_contentieux',
    });
    const dynamicUser = await db.manager.save(User, {
      tenant_id: cb.id,
      username: 'dynamic_reference',
      email: 'dynamic-reference@example.test',
      first_name: 'Test',
      last_name: 'Référentiel',
      role: 'collaborateur',
      status: 1,
    });
    const rps = new RolePermissionService(
      db.getRepository(RolePermission),
      null as any,
      null as any,
    );
    const roleService = new UserRolesService(db.getRepository(UserRole), rps);
    const users = new UsersService(
      db.getRepository(User),
      db.getRepository(Customer),
      roleService,
      {} as any,
    );
    const assignments = new UserRoleAssignmentService(
      db.getRepository(UserRoleAssignment),
      users,
      roleService,
    );
    await tenant.run(cb.id, () =>
      assignments.create({
        user_id: dynamicUser.id,
        role_id: customRole.id,
      } as any),
    );
    assert.equal(
      (await db.manager.findOneByOrFail(User, { id: dynamicUser.id })).role,
      'responsable_contentieux',
    );
    process.env.JWT_SECRET =
      'reference-test-secret-for-isolated-sessions-123456789';
    const strategy = new JwtStrategy(users, tenant, db);
    const principal = await strategy.validate({} as any, {
      sub: dynamicUser.id,
      tenantId: cb.id,
      permissions: ['obsolete_permission'],
    });
    assert.equal(principal.role, 'responsable_contentieux');
    assert.equal(principal.base_role, 'avocat');
    assert.ok(principal.permissions.includes('view_dossiers'));
    assert.ok(principal.permissions.includes('edit_dossier'));
    assert.ok(!principal.permissions.includes('obsolete_permission'));
    assert.equal(
      await tenant.run(ca.id, () =>
        users.getAccessRole('responsable_contentieux'),
      ),
      null,
    );
    await tenant.run(cb.id, () =>
      assert.rejects(() => roleService.remove(customRole.id), /Réaffectez/),
    );
    console.log(
      'PASS dynamic role assignment, fresh session permissions, business category and tenant isolation',
    );

    const invalidAi = new PlatformReferenceAiService(db, service, {
      getPlatformModel: async () => ({
        invoke: async () => ({
          content: JSON.stringify({
            answer: 'Proposition invalide',
            changes: [
              {
                kind: 'roles',
                key: 'secretaire',
                values: { permissions: ['invented_capability'] },
              },
            ],
            warnings: [],
            references: ['roles/secretaire'],
          }),
        }),
      }),
    } as any);
    const beforeInvalid = (await service.detail(STANDARD_PROFILE_ID)).current;
    const invalidReply = await invalidAi.ask(
      STANDARD_PROFILE_ID,
      'Ajoute une capacité inconnue',
      owner,
      'roles',
    );
    assert.equal(invalidReply.proposal, null);
    assert.ok(invalidReply.warnings.length);
    assert.equal(
      (await service.detail(STANDARD_PROFILE_ID)).current.lock_version,
      beforeInvalid.lock_version,
    );
    console.log('PASS invalid AI proposal rejected without draft mutation');

    const q = db.createQueryRunner();
    await q.connect();
    try {
      await new ReferenceDataManagement1792300000000().up(q);
    } finally {
      await q.release();
    }
    const columns = await db.query(
      "SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='user' AND COLUMN_NAME='role') OR (TABLE_NAME='user_role' AND COLUMN_NAME='id') OR (TABLE_NAME='permission' AND COLUMN_NAME='id'))",
    );
    assert.ok(
      columns.some(
        (c: any) => c.TABLE_NAME === 'user' && c.DATA_TYPE === 'varchar',
      ),
    );
    assert.ok(
      columns
        .filter((c: any) => c.COLUMN_NAME === 'id')
        .every((c: any) => c.DATA_TYPE === 'int'),
    );
    assert.ok(
      await db.manager.findOneBy(UserRole, {
        id: customRole.id,
        code: 'responsable_contentieux',
      }),
    );
    console.log('PASS IAM migration retains dynamic roles and references');

    console.log('REFERENCE INTEGRATION SUCCESS');
  } finally {
    if (db?.isInitialized) await db.destroy();
    await admin.query('DROP DATABASE ' + name);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(
    error.stack?.split('\n').slice(0, 6).join('\n'),
    error.code ?? error.driverError?.code ?? '',
  );
  process.exitCode = 1;
});
