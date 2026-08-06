import { BadRequestException } from '@nestjs/common';
import { EventType, TaskStatus } from '../entities/enums/instance-status.enum';
import { ProcedureTaskSubscriber } from '../subscribers/procedure-task.subscriber';
import { TaskService } from './task.service';

describe('TaskService - commande procédurale durable', () => {
  const task = {
    id: 'task-1',
    instanceId: 'instance-1',
    status: TaskStatus.IN_PROGRESS,
    completedAt: null,
  };
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn(() => repository),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args.at(-1);
      return callback(manager);
    }),
  };
  const outbox = { enqueue: jest.fn() };
  const audit = { append: jest.fn() };
  const service = new TaskService(
    {} as any,
    {} as any,
    dataSource as any,
    audit as any,
    outbox as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ ...task });
    repository.save.mockImplementation(async (value) => value);
  });

  it('complète sous verrou et publie un événement outbox idempotent', async () => {
    const result = await service.complete('task-1', '42');

    expect(result.status).toBe(TaskStatus.COMPLETED);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'procedure.task.completed',
        idempotencyKey: 'procedure-task-completed:task-1',
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: '42',
        action: 'procedure.task.completed',
      }),
    );
  });

  it('interdit de contourner la commande de complétion par le statut générique', async () => {
    await expect(
      service.updateStatus('task-1', TaskStatus.COMPLETED, '42'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('ProcedureTaskSubscriber', () => {
  it("rejoue l'événement durable dans le moteur d'instance sécurisé", async () => {
    const triggerEventOnInstance = jest.fn();
    const subscriber = new ProcedureTaskSubscriber({
      triggerEventOnInstance,
    } as any);

    await subscriber.onTaskCompleted({
      taskId: 'task-1',
      instanceId: 'instance-1',
      actorId: 42,
      completedAt: '2026-07-28T10:00:00.000Z',
    });

    expect(triggerEventOnInstance).toHaveBeenCalledWith(
      'instance-1',
      EventType.TASK_COMPLETED,
      {
        taskId: 'task-1',
        completedAt: '2026-07-28T10:00:00.000Z',
      },
      '42',
    );
  });
});
