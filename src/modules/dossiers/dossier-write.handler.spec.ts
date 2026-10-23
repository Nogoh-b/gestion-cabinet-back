import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { WorkflowEngine } from 'src/modules/case-workflow/case-workflow.enums';
import {
  applyDossierNumberChoice,
  DOSSIER_NUMBER_AUTO_CHOICE,
  DossierWriteHandler,
  REUSE_DOSSIER_ID_FIELD,
} from './dossier-write.handler';
import { AmbiguityException } from 'src/core/ai-database/write/ambiguity.exception';

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

  describe('numéro de dossier fourni (référence lue dans un document)', () => {
    const insertHandler = (holder: { deleted_at: Date | null } | null, save?: () => Promise<any>, reuseTarget: any = null) => {
      const handler = createHandler();
      const stubs: Record<string, unknown> = {
        filterKnownColumns: (fields: any) => ({ ...fields }),
        stripAutoGeneratedFields: (fields: any) => {
          const { dossier_number: _ignored, ...rest } = fields;
          return rest;
        },
        getNewDossierWorkflowEngine: async () => WorkflowEngine.LEGACY,
        generateDossierNumber: jest.fn(async () => 'DOS-2026-0043'),
        findDossierByNumber: jest.fn(async () => holder),
        schemaMetadata: { getTableLabel: () => 'Dossiers', getBusinessLabel: (_t: string, c: string) => c },
        dossierRepo: { save: jest.fn(save ?? (async (d: any) => ({ id: 101, ...d }))), findOne: jest.fn(async () => reuseTarget) },
      };
      for (const [key, value] of Object.entries(stubs)) {
        Object.defineProperty(handler, key, { value });
      }
      return handler as any;
    };

    it('garde le numéro s’il est libre', async () => {
      const result = await insertHandler(null).doInsert({ dossier_number: 'CD-2026-010', client_id: 9 }, '7');
      expect(result.data.dossier_number).toBe('CD-2026-010');
      expect(result.message).toBe('Dossier CD-2026-010 créé avec succès');
    });

    it('propose un choix au lieu d’échouer quand le numéro appartient à un dossier actif', async () => {
      await expect(
        insertHandler({ deleted_at: null }).doInsert({ dossier_number: 'CD-2026-010', client_id: 9 }, '7'),
      ).rejects.toBeInstanceOf(AmbiguityException);
    });

    it('attribue un numéro libre quand il appartient à un dossier en corbeille', async () => {
      const result = await insertHandler({ deleted_at: new Date() }).doInsert({ dossier_number: 'CD-2026-010', client_id: 9 }, '7');
      expect(result.data.dossier_number).toBe('DOS-2026-0043');
      expect(result.message).toContain('le numéro « CD-2026-010 » appartient à un dossier supprimé : numéro DOS-2026-0043 attribué');
    });

    it('traduit une collision SQL sans le préfixe du cabinet', async () => {
      const duplicate = Object.assign(new Error('dup'), {
        code: 'ER_DUP_ENTRY',
        sqlMessage: "Duplicate entry '22-CD-2026-010' for key 'UQ_dossiers_tenant_dossier_number'",
      });
      const handler = insertHandler(null, async () => {
        throw duplicate;
      });
      await expect(
        new TenantContext().run(22, () => handler.doInsert({ dossier_number: 'CD-2026-010', client_id: 9 }, '7')),
      ).rejects.toThrow('Un enregistrement « Dossiers » avec la valeur « CD-2026-010 » existe déjà.');
    });

    it('détaille le choix : dossier existant ou nouveau numéro automatique', async () => {
      const holder = { id: 55, dossier_number: 'CD-2026-010', object: 'Litige foncier', deleted_at: null } as any;
      const error = await insertHandler(holder)
        .doInsert({ dossier_number: 'CD-2026-010', client_id: 9 }, '7')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AmbiguityException);
      const ambiguity = error as AmbiguityException;
      expect(ambiguity.fieldName).toBe('dossier_number');
      expect(ambiguity.searchTerm).toBe('CD-2026-010');
      expect(ambiguity.candidates.map((c) => c.id)).toEqual([55, DOSSIER_NUMBER_AUTO_CHOICE]);
    });

    it('réutilise le dossier existant quand l’utilisateur le choisit (pas de doublon)', async () => {
      const existing: any = { id: 55, dossier_number: 'CD-2026-010', object: 'Litige foncier' };
      const result = await insertHandler({ deleted_at: null }, undefined, existing)
        .doInsert({ dossier_number: 'CD-2026-010', client_id: 9, [REUSE_DOSSIER_ID_FIELD]: 55 }, '7');
      expect(result.affected).toBe(0);
      expect(result.entityId).toBe(55);
      expect(result.data).toBe(existing);
      expect(result.message).toContain('pas de doublon créé');
    });

    it('applique le choix numéro automatique / réutilisation / numéro saisi', () => {
      expect(
        applyDossierNumberChoice({ dossier_number: 'CD-2026-010', client_id: 9 }, DOSSIER_NUMBER_AUTO_CHOICE, undefined),
      ).toEqual({ fields: { client_id: 9 }, note: 'création avec un nouveau numéro automatique' });
      expect(
        applyDossierNumberChoice({ dossier_number: 'CD-2026-010', client_id: 9 }, 55, undefined),
      ).toEqual({
        fields: { dossier_number: 'CD-2026-010', client_id: 9, [REUSE_DOSSIER_ID_FIELD]: 55 },
        note: 'dossier existant réutilisé',
      });
      expect(
        applyDossierNumberChoice({ dossier_number: 'CD-2026-010', client_id: 9 }, undefined, 'CD-2026-999'),
      ).toEqual({
        fields: { dossier_number: 'CD-2026-999', client_id: 9 },
        note: 'numéro « CD-2026-999 » demandé',
      });
      expect(() => applyDossierNumberChoice({ client_id: 9 }, undefined, undefined)).toThrow(
        'Choisissez le dossier existant',
      );
    });
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
