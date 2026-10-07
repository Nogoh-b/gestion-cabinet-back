import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { WorkflowEngine } from 'src/modules/case-workflow/case-workflow.enums';
import { DossierWriteHandler } from './dossier-write.handler';

describe('DossierWriteHandler', () => {
  const createHandler = (): DossierWriteHandler => {
    const handler = Object.create(
      DossierWriteHandler.prototype,
    ) as DossierWriteHandler;
    Object.defineProperty(handler, 'logger', {
      value: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    Object.defineProperty(handler, 'entityResolver', {
      value: { resolveOrCreateEntity: jest.fn() },
    });
    return handler;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('autorise une création IA sans avocat, type ni sous-type', async () => {
    const handler = createHandler();

    const result = await handler.validateFields(
      { client_id: 67, object: 'Litige contractuel' },
      'INSERT',
    );

    expect(result).toEqual({
      valid: true,
      errors: [],
      transformedFields: { client_id: 67, object: 'Litige contractuel' },
    });
  });

  it('déclare les références optionnelles dans le schéma présenté à l’IA', async () => {
    jest
      .spyOn(BaseWriteHandler.prototype, 'getWriteableFieldsSchema')
      .mockResolvedValue([
        { name: 'object', label: 'Objet', type: 'string', required: true },
        {
          name: 'court_name',
          label: 'Nature',
          type: 'string',
          required: false,
        },
        { name: 'lawyer_id', label: 'Avocat', type: 'number', required: true },
        {
          name: 'procedure_type_id',
          label: 'Type',
          type: 'number',
          required: true,
        },
        {
          name: 'procedure_subtype_id',
          label: 'Sous-type',
          type: 'number',
          required: true,
        },
      ] as any);
    const handler = createHandler();

    const schema = await handler.getWriteableFieldsSchema();

    expect(schema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'object',
          description: expect.stringContaining("Nom de l'affaire"),
        }),
        expect.objectContaining({
          name: 'court_name',
          description: expect.stringContaining("Nature de l'affaire"),
        }),
        expect.objectContaining({ name: 'lawyer_id', required: false }),
        expect.objectContaining({ name: 'procedure_type_id', required: false }),
        expect.objectContaining({
          name: 'procedure_subtype_id',
          required: false,
        }),
      ]),
    );
  });

  it('ne demande aucune clarification pour les références optionnelles absentes', async () => {
    const fields = { client_id: 67, object: 'Litige contractuel' };
    jest
      .spyOn(BaseWriteHandler.prototype, 'resolveDependencies')
      .mockResolvedValue(fields);
    const handler = createHandler();

    await expect(handler.resolveDependencies(fields, '12')).resolves.toEqual(
      fields,
    );
  });

  it('conserve la résolution du type et du sous-type lorsqu’ils sont fournis', async () => {
    jest
      .spyOn(BaseWriteHandler.prototype, 'resolveDependencies')
      .mockResolvedValue({
        client_id: 67,
        object: 'Litige contractuel',
      });
    const handler = createHandler();

    await expect(
      handler.resolveDependencies(
        {
          client_id: 67,
          object: 'Litige contractuel',
          procedure_type: '11',
          procedure_subtype: '12',
        },
        '12',
      ),
    ).resolves.toEqual({
      client_id: 67,
      object: 'Litige contractuel',
      procedure_type_id: 11,
      procedure_subtype_id: 12,
    });
  });

  it('convertit les libellés métier du formulaire vers les champs du dossier', async () => {
    jest
      .spyOn(BaseWriteHandler.prototype, 'resolveDependencies')
      .mockImplementation(async (fields) => fields);
    const handler = createHandler();

    await expect(
      handler.resolveDependencies(
        {
          client_id: 67,
          case_name: 'Affaire Société ABC',
          nature: 'Recouvrement de créance',
        },
        '12',
      ),
    ).resolves.toEqual({
      client_id: 67,
      object: 'Affaire Société ABC',
      court_name: 'Recouvrement de créance',
    });
  });

  it('utilise le parcours V2 pour une création IA lorsque le cabinet le demande', async () => {
    const handler = createHandler();
    const findOne = jest.fn(async () => ({
      enabled: true,
      default_for_new_dossiers: true,
    }));
    Object.defineProperty(handler, 'caseWorkflowFeatureRepository', {
      value: { findOne },
    });

    const workflowEngine = await new TenantContext().run(22, () =>
      (handler as any).getNewDossierWorkflowEngine(),
    );

    expect(findOne).toHaveBeenCalledWith({ where: { tenant_id: 22 } });
    expect(workflowEngine).toBe(WorkflowEngine.ACTIONS_V2);
  });

  it('conserve le parcours historique lorsque le parcours V2 n’est pas activé', async () => {
    const handler = createHandler();
    Object.defineProperty(handler, 'caseWorkflowFeatureRepository', {
      value: {
        findOne: jest.fn(async () => ({
          enabled: false,
          default_for_new_dossiers: true,
        })),
      },
    });

    const workflowEngine = await new TenantContext().run(22, () =>
      (handler as any).getNewDossierWorkflowEngine(),
    );

    expect(workflowEngine).toBe(WorkflowEngine.LEGACY);
  });
});
