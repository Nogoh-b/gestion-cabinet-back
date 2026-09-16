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
});
