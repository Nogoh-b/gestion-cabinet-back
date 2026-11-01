import { BadRequestException } from '@nestjs/common';
import {
  ProcedureTemplate,
  ProcedureTemplateLifecycle,
} from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { Transition } from '../entities/transition.entity';
import { TransitionType } from '../entities/enums/instance-status.enum';
import { ProcedureTemplateService } from './procedure-template.service';
import { ProcedureRequirementType } from '../interfaces/procedure-requirement.interface';
import { getMetadataArgsStorage } from 'typeorm';

describe('ProcedureTemplateService', () => {
  const createService = (overrides?: {
    templateRepository?: any;
    dataSource?: any;
  }) =>
    new ProcedureTemplateService(
      (overrides?.templateRepository ?? {}) as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      (overrides?.dataSource ?? {}) as any,
    );

  const stage = (id: string, order: number): Stage =>
    ({
      id,
      order,
      name: `Étape ${order}`,
      description: null,
      canBeSkipped: false,
      canBeReentered: false,
      config: null,
      subStages: [],
    }) as unknown as Stage;

  const transition = (
    id: string,
    fromStageId: string,
    toStageId: string,
    condition: any = null,
  ): Transition =>
    ({
      id,
      templateId: 'template-1',
      fromStageId,
      toStageId,
      type: TransitionType.MANUAL,
      label: null,
      condition,
      triggerEvent: null,
      triggerCondition: null,
      isDefault: true,
      requiresDecision: false,
      requiresValidation: false,
      onTransition: null,
    }) as unknown as Transition;

  const template = (
    stages: Stage[],
    transitions: Transition[],
  ): ProcedureTemplate =>
    ({
      id: 'template-1',
      familyId: 'family-1',
      version: 1,
      name: 'Procédure cabinet',
      description: null,
      lifecycleStatus: ProcedureTemplateLifecycle.DRAFT,
      stages,
      transitions,
      cycles: [],
    }) as unknown as ProcedureTemplate;

  it('refuse un cycle ordinaire non borné', () => {
    const service = createService();
    const value = template(
      [stage('a', 0), stage('b', 1)],
      [transition('ab', 'a', 'b'), transition('ba', 'b', 'a')],
    );

    expect(() => (service as any).validateGraph(value)).toThrow(
      BadRequestException,
    );
  });

  it('refuse une condition illisible de manière restrictive', () => {
    const service = createService();
    const value = template(
      [stage('a', 0), stage('b', 1)],
      [transition('ab', 'a', 'b', '{invalid-json')],
    );

    expect(() => (service as any).validateGraph(value)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.stringContaining('condition illisible'),
          ]),
        }),
      }),
    );
  });

  it("inclut les exigences dans l'empreinte de la version", () => {
    const service = createService();
    const firstStage = stage('a', 0);
    firstStage.subStages = [
      {
        id: 'sub-stage-1',
        order: 0,
        name: 'Pièce préalable',
        description: null,
        isMandatory: true,
        requirements: [],
      } as any,
    ];
    const value = template(
      [firstStage, stage('b', 1)],
      [transition('ab', 'a', 'b')],
    );
    const withoutRequirement = service.hashSnapshot(
      service.buildSnapshot(value),
    );
    firstStage.subStages[0].requirements = [
      {
        id: 'accepted-document',
        type: ProcedureRequirementType.DOCUMENT_ACCEPTED,
      },
    ];
    const withRequirement = service.hashSnapshot(service.buildSnapshot(value));

    expect(withRequirement).not.toEqual(withoutRequirement);
    expect(
      (service.buildSnapshot(value).stages as any[])[0].subStages[0]
        .requirements,
    ).toEqual([
      {
        id: 'accepted-document',
        type: ProcedureRequirementType.DOCUMENT_ACCEPTED,
      },
    ]);
  });

  it('refuse toute mise à jour applicative d’une version publiée', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'template-1',
          lifecycleStatus: ProcedureTemplateLifecycle.PUBLISHED,
          stages: [],
        }),
        save: jest.fn(),
      },
    };
    const service = createService({
      templateRepository: {},
      dataSource: {
        createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      },
    });

    await expect(
      service.update('template-1', { name: 'Altération' }),
    ).rejects.toThrow(/immuable/);
    expect(queryRunner.manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it("ne persiste qu'un seul état de cycle de vie du template", () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === ProcedureTemplate)
      .map((column) => String(column.propertyName));

    expect(columns).toContain('lifecycleStatus');
    expect(columns).not.toContain('isActive');
  });

  it('filtre les versions utilisables par le statut PUBLISHED', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = createService({
      templateRepository: { find },
    });

    await service.findAll(true);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lifecycleStatus: ProcedureTemplateLifecycle.PUBLISHED,
        },
      }),
    );
  });
});
