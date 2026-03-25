// services/procedure-instance.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { ProcedureTemplateService } from './procedure-template.service';
import { WorkflowService } from './workflow.service';
import { HistoryService } from './history.service';
import { CreateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { EventType, InstanceStatus } from '../entities/enums/instance-status.enum';

@Injectable()
export class ProcedureInstanceService {
  constructor(
    @InjectRepository(ProcedureInstance)
    private instanceRepository: Repository<ProcedureInstance>,
    private templateService: ProcedureTemplateService,
    private workflowService: WorkflowService,
    private historyService: HistoryService,
  ) {}

  async create(dto: CreateProcedureInstanceDto, userId: string): Promise<ProcedureInstance> {
    const template = await this.templateService.findOne(dto.templateId);

    if (!template.stages || template.stages.length === 0) {
      throw new Error('Template has no stages');
    }

    // Trier les stages par ordre
    const firstStage = template.stages.sort((a, b) => a.order - b.order)[0];

    const instance = this.instanceRepository.create({
      templateId: dto.templateId,
      title: dto.title,
      status: InstanceStatus.ACTIVE,
      currentStageId: firstStage.id,
      data: dto.data || {},
    });

    await this.instanceRepository.save(instance);

    // Enregistrer l'entrée dans le premier stage
    await this.historyService.log(
      instance.id,
      EventType.STAGE_ENTER,
      firstStage.id,
      userId,
      { message: 'Instance créée' },
    );

    return this.findOne(instance.id);
  }

  async findAll(filters?: { status?: InstanceStatus; templateId?: string }): Promise<ProcedureInstance[]> {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.templateId) where.templateId = filters.templateId;

    return this.instanceRepository.find({
      where,
      relations: ['template', 'currentStage', 'tasks'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ProcedureInstance> {
    const instance = await this.instanceRepository.findOne({
      where: { id },
      relations: ['template', 'currentStage', 'decisions', 'tasks', 'history'],
    });
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${id} not found`);
    }
    return instance;
  }

  async updateStatus(id: string, status: InstanceStatus, userId: string): Promise<ProcedureInstance> {
    const instance = await this.findOne(id);
    instance.status = status;
    await this.instanceRepository.save(instance);

    await this.historyService.log(
      instance.id,
      EventType.DECISION,
      instance.currentStageId,
      userId,
      { status, action: 'status_updated' },
    );

    return instance;
  }

  async getWorkflowStatus(id: string): Promise<any> {
    const instance = await this.findOne(id);
    const availableTransitions = await this.workflowService.getAvailableTransitions(id);

    return {
      instance,
      currentStage: instance.currentStage,
      availableTransitions,
      history: instance.history,
      tasks: instance.tasks,
    };
  }
}