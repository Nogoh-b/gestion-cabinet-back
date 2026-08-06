// services/task.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan } from 'typeorm';
import { Task } from '../entities/task.entity';
import { CreateTaskDto } from '../dto/create-task.dto';
import { ProcedureInstanceService } from './procedure-instance.service';
import { TaskStatus } from '../entities/enums/instance-status.enum';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private instanceService: ProcedureInstanceService,
    private dataSource: DataSource,
    private auditService: AuditService,
    private outboxService: OutboxService,
  ) {}

  async create(instanceId: string, dto: CreateTaskDto): Promise<Task> {
    await this.instanceService.findOne(instanceId);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Task);
      const task = await repository.save(repository.create({
        instanceId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate,
        assignedTo: dto.assignedTo,
        status: TaskStatus.PENDING,
      }));
      await this.auditService.append(manager, {
        action: 'procedure.task.created',
        resourceType: 'Task',
        resourceId: task.id,
        afterState: {
          instanceId,
          status: task.status,
          assignedTo: task.assignedTo,
          dueDate: task.dueDate,
        },
      });
      return task;
    });
  }

  async findAllByInstance(instanceId: string): Promise<Task[]> {
    return this.taskRepository.find({
      where: { instanceId },
      order: { dueDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['instance'],
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async complete(id: string, userId: string): Promise<Task> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const repository = manager.getRepository(Task);
      const task = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      if (task.status === TaskStatus.COMPLETED) return task;
      const previousStatus = task.status;
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      const saved = await repository.save(task);
      await this.outboxService.enqueue(manager, {
        eventType: 'procedure.task.completed',
        aggregateType: 'Task',
        aggregateId: saved.id,
        idempotencyKey: `procedure-task-completed:${saved.id}`,
        payload: {
          taskId: saved.id,
          instanceId: saved.instanceId,
          actorId: userId,
          completedAt: saved.completedAt.toISOString(),
        },
      });
      await this.auditService.append(manager, {
        actorId: userId,
        action: 'procedure.task.completed',
        resourceType: 'Task',
        resourceId: saved.id,
        beforeState: { status: previousStatus },
        afterState: {
          status: saved.status,
          completedAt: saved.completedAt,
        },
      });
      return saved;
    });
  }

  async updateStatus(
    id: string,
    status: TaskStatus,
    userId: string,
  ): Promise<Task> {
    if (status === TaskStatus.COMPLETED) {
      throw new BadRequestException(
        'Utilisez la commande dédiée de complétion de tâche',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Task);
      const task = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new BadRequestException(
          'Une tâche complétée ne peut plus être modifiée',
        );
      }
      const previousStatus = task.status;
      task.status = status;
      const saved = await repository.save(task);
      await this.auditService.append(manager, {
        actorId: userId,
        action: 'procedure.task.status_changed',
        resourceType: 'Task',
        resourceId: saved.id,
        beforeState: { status: previousStatus },
        afterState: { status: saved.status },
      });
      return saved;
    });
  }

  async checkOverdueTasks(): Promise<Task[]> {
    const overdueTasks = await this.taskRepository.find({
      where: {
        status: TaskStatus.PENDING,
        dueDate: LessThan(new Date()),
      },
    });

    for (const task of overdueTasks) {
      task.status = TaskStatus.OVERDUE;
      await this.taskRepository.save(task);
    }

    return overdueTasks;
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Task);
      const task = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new BadRequestException(
          'Une tâche complétée ne peut pas être supprimée',
        );
      }
      await repository.softRemove(task);
      await this.auditService.append(manager, {
        actorId: userId,
        action: 'procedure.task.deleted',
        resourceType: 'Task',
        resourceId: task.id,
        beforeState: {
          instanceId: task.instanceId,
          status: task.status,
        },
      });
    });
  }
}
