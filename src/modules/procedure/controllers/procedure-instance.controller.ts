// controllers/procedure-instance.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req
} from '@nestjs/common';
import { ProcedureInstanceService } from '../services/procedure-instance.service';
import { WorkflowService } from '../services/workflow.service';
import { CreateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { InstanceStatus } from '../entities/enums/instance-status.enum';
import { ApplyTransitionDto } from '../dto/create-procedure-instance.dto copy';

@Controller('procedure-instances')
export class ProcedureInstanceController {
  constructor(
    private readonly instanceService: ProcedureInstanceService,
    private readonly workflowService: WorkflowService,
  ) {}

  @Post()
  async create(@Body() dto: CreateProcedureInstanceDto, @Req() req: any) {
    // Récupérer l'utilisateur connecté (à adapter selon votre auth)
    const userId = req.user?.id || 'system';
    return this.instanceService.create(dto, userId);
  }

  @Get()
  async findAll(
    @Query('status') status?: InstanceStatus,
    @Query('templateId') templateId?: string,
  ) {
    return this.instanceService.findAll({ status, templateId });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.instanceService.findOne(id);
  }

  @Get(':id/workflow')
  async getWorkflowStatus(@Param('id') id: string) {
    return this.instanceService.getWorkflowStatus(id);
  }

  @Get(':id/transitions')
  async getAvailableTransitions(@Param('id') id: string) {
    return this.workflowService.getAvailableTransitions(id);
  }

  @Post(':id/transitions')
  async applyTransition(
    @Param('id') id: string,
    @Body() dto: ApplyTransitionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.workflowService.applyManualTransition(id, dto, userId);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: InstanceStatus,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.instanceService.updateStatus(id, status, userId);
  }
}