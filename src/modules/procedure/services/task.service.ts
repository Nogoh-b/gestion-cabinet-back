// services/task.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Task } from '../entities/task.entity';
import { CreateTaskDto } from '../dto/create-task.dto';
import { ProcedureInstanceService } from './procedure-instance.service';
import { WorkflowService } from './workflow.service';
import { EventType, TaskStatus } from '../entities/enums/instance-status.enum';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private instanceService: ProcedureInstanceService,
    private workflowService: WorkflowService,
  ) {}

  async create(instanceId: string, dto: CreateTaskDto): Promise<Task> {
    const instance = await this.instanceService.findOne(instanceId);

    const task = this.taskRepository.create({
      instanceId,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      assignedTo: dto.assignedTo,
      status: TaskStatus.PENDING,
    });

    return this.taskRepository.save(task);
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
    const task = await this.findOne(id);
    task.status = TaskStatus.COMPLETED;
    task.completedAt = new Date();
    await this.taskRepository.save(task);
    const instance = await this.instanceService.findOne(task.instanceId);

    // Déclencher les transitions automatiques basées sur la complétion de tâche
    await this.workflowService.triggerAutomaticTransitions(
      instance,
      EventType.TASK_COMPLETED,
      { taskId: task.id, task },
    );

    return task;
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;
    if (status === TaskStatus.COMPLETED && !task.completedAt) {
      task.completedAt = new Date();
    }
    return this.taskRepository.save(task);
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

  async delete(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.taskRepository.remove(task);
  }
}