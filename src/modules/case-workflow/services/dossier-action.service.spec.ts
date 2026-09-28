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
