import { DossierActionService } from './dossier-action.service';
import { describe, expect, it, jest } from '@jest/globals';
import {
  ActionPriority,
  DossierActionStatus,
} from '../case-workflow.enums';
import {
  DiligencePriority,
  DiligenceStatus,
  DiligenceType,
} from 'src/modules/diligence/entities/diligence.entity';
import {
  Audience,
  AudienceStatus,
} from 'src/modules/audiences/entities/audience.entity';
import { DossierActionAudienceLink } from '../entities/dossier-action.entity';
import { CaseWorkflowEvent } from '../entities/workflow-audit.entity';

describe('DossierActionService - diligence liée', () => {
  const buildService = () =>
    new DossierActionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it('crée une diligence personnelle lors de l’affectation d’une action', async () => {
    const repository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const action = {
      id: 'action-1',
      tenant_id: 7,
      dossier_id: 42,
      responsible_user_id: 15,
      title: 'Préparer les conclusions',
      planned_at: new Date('2026-09-16T08:00:00.000Z'),
      due_at: new Date('2026-09-20T16:00:00.000Z'),
      status: DossierActionStatus.TODO,
      priority: ActionPriority.HIGH,
    };

    await (buildService() as any).createLinkedDiligence(manager, action);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source_action_id: 'action-1',
        dossier_id: 42,
        assigned_lawyer_id: 15,
        title: 'Préparer les conclusions',
        type: DiligenceType.GENERAL,
        status: DiligenceStatus.DRAFT,
        priority: DiligencePriority.HIGH,
      }),
    );
  });

  it('synchronise la fin de l’action avec la diligence existante', async () => {
    const diligence = {
      title: 'Ancien titre',
      status: DiligenceStatus.IN_PROGRESS,
      completion_date: null,
    };
    const repository = {
      findOne: jest.fn(async () => diligence as any),
      save: jest.fn(async (value) => value),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const completedAt = new Date('2026-09-18T10:00:00.000Z');

    await (buildService() as any).syncLinkedDiligence(manager, {
      id: 'action-1',
      tenant_id: 7,
      responsible_user_id: 15,
      title: 'Préparer les conclusions',
      due_at: new Date('2026-09-20T16:00:00.000Z'),
      completed_at: completedAt,
      status: DossierActionStatus.COMPLETED,
      priority: ActionPriority.NORMAL,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DiligenceStatus.COMPLETED,
        completion_date: completedAt,
      }),
    );
  });

  it(`retourne chaque modification d'échéance avec son auteur`, async () => {
    const events = [
      {
        id: 'event-1',
        event_type: 'DOSSIER_ACTION_DEADLINE_EXTENDED',
        occurred_at: new Date('2026-09-29T09:00:00.000Z'),
        aggregate_type: 'DossierAction',
        aggregate_id: 'action-1',
        actor_user_id: 12,
        payload: {
          previousDueAt: '2026-09-29T08:00:00.000Z',
          dueAt: '2026-10-02T08:00:00.000Z',
          reason: 'Pièces complémentaires attendues',
        },
        idempotency_key: 'internal-key',
      },
    ];
    const eventRepository = { find: jest.fn(async () => events) };
    const userRepository = {
      find: jest.fn(async () => [
        { id: 12, first_name: 'Brice', last_name: 'Kamdem' },
      ]),
    };
    const dataSource = {
      manager: {},
      getRepository: jest.fn((entity) =>
        entity === CaseWorkflowEvent ? eventRepository : userRepository,
      ),
    };
    const actionRepository = {
      findOne: jest.fn(async () => ({
        id: 'action-1',
        tenant_id: 1,
        dossier_id: 42,
      })),
    };
    const service = new DossierActionService(
      dataSource as any,
      actionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'assertConfidentialDossierAccess')
      .mockResolvedValue({});

    const history = await service.getDeadlineHistory('action-1', 12);

    expect(eventRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { occurred_at: 'DESC' } }),
    );
    expect(userRepository.find).toHaveBeenCalled();
    expect(history).toEqual([
      expect.objectContaining({
        id: 'event-1',
        actor: expect.objectContaining({ full_name: 'Brice Kamdem' }),
      }),
    ]);
    expect(history[0]).not.toHaveProperty('idempotency_key');
  });

  it(`enregistre le rapport d'audience quand l'action de compte rendu se termine`, async () => {
    const markAsHeld = jest.fn();
    const audience = {
      id: 44,
      status: AudienceStatus.SCHEDULED,
      report_content: null,
      report_date: null,
      report_author_id: null,
      mark_as_held: markAsHeld,
    };
    const linkRepository = {
      find: jest.fn(async () => [{ audience_id: 44 }]),
    };
    const audienceRepository = {
      findOne: jest.fn(async () => audience),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === DossierActionAudienceLink
          ? linkRepository
          : audienceRepository,
      ),
    };

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-report',
        definition_code: 'WRITE_HEARING_REPORT',
        definition_label: `Faire le compte rendu d'audience`,
        specific_data: {},
      },
      {
        result_code: 'HELD',
        specific_data: { report_content: `Compte rendu complet de l'audience.` },
        audiences: [],
      },
      12,
    );

    expect(audienceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        report_content: `Compte rendu complet de l'audience.`,
        report_author_id: '12',
      }),
    );
    expect(markAsHeld).toHaveBeenCalledWith(undefined, 'held');
  });

  it(`execute le report et cree l'audience de remplacement dans la meme transaction`, async () => {
    const audience = Object.assign(new Audience(), {
      id: 44,
      tenant_id: 7,
      dossier_id: '42',
      jurisdiction_id: 3,
      audience_type_id: 2,
      type: 0,
      status: AudienceStatus.SCHEDULED,
      audience_date: new Date('2026-09-20'),
      audience_time: '09:00',
      reminder_sent: false,
      notes: '',
    });
    const linkRepository = {
      find: jest.fn(async () => [{ audience_id: 44 }]),
    };
    const audienceRepository = {
      findOne: jest.fn(async () => audience),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === DossierActionAudienceLink
          ? linkRepository
          : audienceRepository,
      ),
    };

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-report',
        definition_code: 'WRITE_HEARING_REPORT',
        definition_label: `Faire le compte rendu d'audience`,
        specific_data: {},
      },
      {
        result_code: 'POSTPONED',
        specific_data: {
          report_content: `Compte rendu avec decision de renvoi.`,
          postponement_reason: 'Communication de nouvelles pieces',
          new_audience_date: '2026-10-12',
          new_audience_time: '10:30',
        },
        audiences: [],
      },
      12,
    );

    expect(audience.status).toBe(AudienceStatus.POSTPONED);
    expect(audience.report_content).toBe(`Compte rendu avec decision de renvoi.`);
    expect(audienceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_audience_id: 44,
        audience_time: '10:30',
        status: AudienceStatus.SCHEDULED,
      }),
    );
    expect(audienceRepository.save).toHaveBeenCalledTimes(2);
  });
});

describe('DossierActionService - liaisons champ action → champ audience', () => {
  const buildService = () =>
    new DossierActionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

  const buildContext = (audience: any, audienceIds = [44]) => {
    const linkRepository = {
      find: jest.fn(async () => audienceIds.map((id) => ({ audience_id: id }))),
    };
    const audienceRepository = {
      findOne: jest.fn(async () => audience),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };
    return {
      audienceRepository,
      manager: {
        getRepository: jest.fn((entity: any) =>
          entity === DossierActionAudienceLink
            ? linkRepository
            : audienceRepository,
        ),
      },
    };
  };

  const bindingDefinition = (properties: Record<string, unknown>) => ({
    specific_fields_schema: { type: 'object', properties },
  });

  it('recopie les champs liés sur une action qui n’est pas un rapport d’audience', async () => {
    const markAsHeld = jest.fn();
    const audience: any = {
      id: 44,
      status: AudienceStatus.SCHEDULED,
      mark_as_held: markAsHeld,
    };
    const { manager, audienceRepository } = buildContext(audience);

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-plaidoirie',
        definition_code: 'PLAIDER',
        definition_label: 'Plaider le dossier',
        specific_data: {},
        definition: bindingDefinition({
          motifs: { binding: { entity: 'audience', field: 'decision_text' } },
          duree: {
            binding: { entity: 'audience', field: 'duration_minutes' },
          },
        }),
      },
      {
        // Contient « TENUE » : ne doit PAS clôturer l'audience hors rapport.
        result_code: 'AUDIENCE_TENUE',
        specific_data: { motifs: 'Décision motivée.', duree: '90' },
        audiences: [],
      },
      12,
    );

    expect(audience.decision_text).toBe('Décision motivée.');
    expect(audience.duration_minutes).toBe(90);
    expect(audience.report_content).toBeUndefined();
    expect(markAsHeld).not.toHaveBeenCalled();
    expect(audienceRepository.save).toHaveBeenCalledTimes(1);
  });

  it('ignore une liaison visant une colonne protégée', async () => {
    const audience: any = {
      id: 44,
      tenant_id: 7,
      dossier_id: 42,
      status: AudienceStatus.SCHEDULED,
      mark_as_held: jest.fn(),
    };
    const { manager } = buildContext(audience);

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-pirate',
        definition_code: 'PLAIDER',
        definition_label: 'Plaider le dossier',
        specific_data: {},
        definition: bindingDefinition({
          x: { binding: { entity: 'audience', field: 'tenant_id' } },
          y: { binding: { entity: 'audience', field: 'dossier_id' } },
          ok: { binding: { entity: 'audience', field: 'room' } },
        }),
      },
      {
        result_code: 'DONE',
        specific_data: { x: 999, y: 999, ok: 'Salle 3' },
        audiences: [],
      },
      12,
    );

    expect(audience.tenant_id).toBe(7);
    expect(audience.dossier_id).toBe(42);
    expect(audience.room).toBe('Salle 3');
  });

  it('applique les liaisons non concernées par le report après un renvoi', async () => {
    const audience = Object.assign(new Audience(), {
      id: 44,
      tenant_id: 7,
      dossier_id: '42',
      jurisdiction_id: 3,
      audience_type_id: 2,
      type: 0,
      status: AudienceStatus.SCHEDULED,
      audience_date: new Date('2026-09-20'),
      audience_time: '09:00',
      reminder_sent: false,
      notes: '',
    });
    const { manager, audienceRepository } = buildContext(audience);

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-report',
        definition_code: 'WRITE_HEARING_REPORT',
        definition_label: `Faire le compte rendu d'audience`,
        specific_data: {},
        definition: bindingDefinition({
          juge: { binding: { entity: 'audience', field: 'judge_name' } },
          // Cible possédée par le report : doit être ignorée ici.
          issue: { binding: { entity: 'audience', field: 'outcome' } },
        }),
      },
      {
        result_code: 'POSTPONED',
        specific_data: {
          report_content: 'Compte rendu avec renvoi.',
          postponement_reason: 'Pièces manquantes',
          new_audience_date: '2026-10-12',
          new_audience_time: '10:30',
          juge: 'Mme la Présidente Dupont',
          issue: 'favorable',
        },
        audiences: [],
      },
      12,
    );

    expect(audience.status).toBe(AudienceStatus.POSTPONED);
    expect(audience.judge_name).toBe('Mme la Présidente Dupont');
    // Le report reste propriétaire de l'issue.
    expect(audience.outcome).toBe('postponed');
    // original + remplacement + application des liaisons.
    expect(audienceRepository.save).toHaveBeenCalledTimes(3);
  });

  it('refuse une valeur liée invalide et n’écrit rien', async () => {
    const audience: any = {
      id: 44,
      status: AudienceStatus.SCHEDULED,
      mark_as_held: jest.fn(),
    };
    const { manager, audienceRepository } = buildContext(audience);

    await expect(
      (buildService() as any).applyAudienceCompletionEffects(
        manager,
        {
          id: 'action-date',
          definition_code: 'PLAIDER',
          definition_label: 'Plaider le dossier',
          specific_data: {},
          definition: bindingDefinition({
            rendu_le: {
              binding: { entity: 'audience', field: 'decision_date' },
            },
          }),
        },
        {
          result_code: 'DONE',
          specific_data: { rendu_le: 'pas-une-date' },
          audiences: [],
        },
        12,
      ),
    ).rejects.toThrow(/date est invalide/);

    expect(audienceRepository.save).not.toHaveBeenCalled();
  });

  it('ne fait rien quand aucune audience n’est liée à une action à liaisons', async () => {
    const { manager, audienceRepository } = buildContext(null, []);

    await expect(
      (buildService() as any).applyAudienceCompletionEffects(
        manager,
        {
          id: 'action-sans-audience',
          definition_code: 'PLAIDER',
          definition_label: 'Plaider le dossier',
          specific_data: {},
          definition: bindingDefinition({
            note: { binding: { entity: 'audience', field: 'notes' } },
          }),
        },
        { result_code: 'DONE', specific_data: { note: 'RAS' }, audiences: [] },
        12,
      ),
    ).resolves.toBeUndefined();

    expect(audienceRepository.findOne).not.toHaveBeenCalled();
    expect(audienceRepository.save).not.toHaveBeenCalled();
  });

  it('refuse plusieurs audiences liées sur une action à liaisons', async () => {
    const { manager } = buildContext(null, [44, 45]);

    await expect(
      (buildService() as any).applyAudienceCompletionEffects(
        manager,
        {
          id: 'action-multi',
          definition_code: 'PLAIDER',
          definition_label: 'Plaider le dossier',
          specific_data: {},
          definition: bindingDefinition({
            note: { binding: { entity: 'audience', field: 'notes' } },
          }),
        },
        { result_code: 'DONE', specific_data: { note: 'RAS' }, audiences: [] },
        12,
      ),
    ).rejects.toThrow(/une seule audience doit être liée/);
  });

  it('laisse la liaison explicite alimenter le rapport d’audience hérité', async () => {
    const audience: any = {
      id: 44,
      status: AudienceStatus.SCHEDULED,
      mark_as_held: jest.fn(),
    };
    const { manager } = buildContext(audience);

    await (buildService() as any).applyAudienceCompletionEffects(
      manager,
      {
        id: 'action-report',
        definition_code: 'WRITE_HEARING_REPORT',
        definition_label: `Faire le compte rendu d'audience`,
        specific_data: {},
        definition: bindingDefinition({
          // Clé métier libre : le reniflage d'alias ne la trouverait pas.
          mon_compte_rendu: {
            binding: { entity: 'audience', field: 'report_content' },
          },
        }),
      },
      {
        result_code: 'DONE',
        specific_data: { mon_compte_rendu: 'PV rédigé via la liaison.' },
        audiences: [],
      },
      12,
    );

    expect(audience.report_content).toBe('PV rédigé via la liaison.');
    expect(audience.report_author_id).toBe('12');
  });
});
