import { PERMISSIONS_KEY } from 'src/core/decorators/permissions.decorator';
import { ROLES_CONFIG } from 'src/core/auth/seeders/role.seeder';
import { describe, expect, it } from '@jest/globals';
import {
  ActionCatalogController,
  BillableItemsController,
  CaseInvoicesController,
  DossierActionsController,
  DossierWorkspaceController,
  WorkflowMappingsController,
} from './case-workflow.controller';

function permissions(controller: object, method: string): string[] {
  const handler: unknown = (controller as Record<string, unknown>)[method];
  if (typeof handler !== 'function') return [];
  const metadata = Reflect.getMetadata(PERMISSIONS_KEY, handler) as unknown;
  return Array.isArray(metadata)
    ? metadata.filter((value): value is string => typeof value === 'string')
    : [];
}

describe('case-workflow endpoint permissions', () => {
  it('sÃ©pare actions, facturation, clÃ´ture et migration', () => {
    expect(permissions(DossierActionsController.prototype, 'complete')).toEqual(
      ['update_dossier_action'],
    );
    expect(permissions(BillableItemsController.prototype, 'review')).toEqual([
      'manage_billable_items',
    ]);
    expect(
      permissions(BillableItemsController.prototype, 'filterOptions'),
    ).toEqual(['view_billable_items']);
    expect(permissions(CaseInvoicesController.prototype, 'generate')).toEqual([
      'generate_invoice_from_items',
    ]);
    expect(permissions(DossierWorkspaceController.prototype, 'close')).toEqual([
      'close_dossier',
    ]);
    expect(permissions(DossierWorkspaceController.prototype, 'reopen')).toEqual(
      ['reopen_dossier'],
    );
    expect(
      permissions(DossierWorkspaceController.prototype, 'applyMigration'),
    ).toEqual(['migrate_dossier_workflow']);
    expect(permissions(WorkflowMappingsController.prototype, 'create')).toEqual(
      ['manage_action_catalog'],
    );
    expect(
      permissions(
        ActionCatalogController.prototype,
        'getRecommendationRulesForManagement',
      ),
    ).toEqual(['manage_action_catalog']);
    expect(
      permissions(
        ActionCatalogController.prototype,
        'reviseRecommendationRule',
      ),
    ).toEqual(['manage_action_catalog']);
  });

  it('refuse toutes les permissions V2 au client en V1', () => {
    const client = ROLES_CONFIG.find((role) => role.code === 'client');
    const v2Permissions = [
      'view_dossier_actions',
      'create_dossier_action',
      'update_dossier_action',
      'view_billable_items',
      'manage_billable_items',
      'generate_invoice_from_items',
      'close_dossier',
      'reopen_dossier',
      'migrate_dossier_workflow',
    ];
    expect(client).toBeDefined();
    expect(
      client?.permissions.filter((permission) =>
        v2Permissions.includes(permission),
      ),
    ).toEqual([]);
  });

  it('sÃ©pare le traitement du dossier et la production des factures', () => {
    const collaborateur = ROLES_CONFIG.find(
      (role) => role.code === 'collaborateur',
    );
    const comptable = ROLES_CONFIG.find((role) => role.code === 'comptable');
    expect(collaborateur?.permissions).toEqual(
      expect.arrayContaining([
        'view_dossier_actions',
        'create_dossier_action',
        'update_dossier_action',
      ]),
    );
    expect(collaborateur?.permissions).not.toContain(
      'generate_invoice_from_items',
    );
    expect(comptable?.permissions).toEqual(
      expect.arrayContaining([
        'view_billable_items',
        'manage_billable_items',
        'generate_invoice_from_items',
      ]),
    );
    expect(comptable?.permissions).not.toContain('create_dossier_action');
  });
});
