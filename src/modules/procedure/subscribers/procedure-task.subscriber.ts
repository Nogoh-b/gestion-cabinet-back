import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '../entities/enums/instance-status.enum';
import { ProcedureInstanceService } from '../services/procedure-instance.service';

@Injectable()
export class ProcedureTaskSubscriber {
  constructor(
    private readonly instanceService: ProcedureInstanceService,
  ) {}

  @OnEvent('outbox.procedure.task.completed', { async: true })
  async onTaskCompleted(payload: {
    taskId: string;
    instanceId: string;
    actorId?: string | number;
    completedAt?: string;
  }): Promise<void> {
    await this.instanceService.triggerEventOnInstance(
      payload.instanceId,
      EventType.TASK_COMPLETED,
      {
        taskId: payload.taskId,
        completedAt: payload.completedAt ?? null,
      },
      payload.actorId == null ? 'system' : String(payload.actorId),
    );
  }
}
