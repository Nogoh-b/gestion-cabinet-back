// controllers/procedure-instance.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseInterceptors,
  UploadedFiles
} from '@nestjs/common';
import { ProcedureInstanceService } from '../services/procedure-instance.service';
import { WorkflowService } from '../services/workflow.service';
import { CreateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { InstanceStatus } from '../entities/enums/instance-status.enum';
import { ApplyTransitionDto } from '../dto/create-procedure-instance.dto copy';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TriggerEventDto } from '../dto/trigger-event.dto';

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





  @Get(':id/cycles')
  async getAvailableCycles(@Param('id') id: string) {
    return this.instanceService.getAvailableCycles(id);
  }

  @Post(':id/sub-stages/:subStageId/complete')
  async completeSubStage(
    @Param('id') id: string,
    @Param('subStageId') subStageId: string,
    @Param('notes') notes: string,
    @Param('skipAutoTransitions') skipAutoTransitions: boolean,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.instanceService.completeSubStage(id, subStageId, userId,notes,skipAutoTransitions);
  }

  @Post(':id/sub-stages/:subStageId/start')
  async startSubStage(
    @Param('id') id: string,
    @Param('subStageId') subStageId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.instanceService.startSubStage(id, subStageId, userId);
  }

  @Post(':id/transitions/:transitionId/apply')
  @UseInterceptors(FilesInterceptor('files', 10))
  async applyTransition1(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
    @Body() dto: ApplyTransitionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    
    // Gérer les fichiers uploadés
    let fileIds: number[] = [];
    if (files && files.length > 0) {
      // Uploader les fichiers et récupérer leurs IDs
      // fileIds = await this.uploadService.uploadFiles(files);
    }
    
    return this.instanceService.applyTransition(
      id,
      transitionId,
      userId,
      dto.userInputs,
      // fileIds,
      dto.comment,
    );
  }

  @Post(':id/cycles/:cycleId/apply')
  async applyCycle(
    @Param('id') id: string,
    @Param('cycleId') cycleId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 'system';
    return this.instanceService.applyCycle(id, cycleId, userId);
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


  @Post(':id/reset')
  async resetInstance(
      @Param('id') id: string,
      @Body() body: { 
          keepTitle?: boolean; 
          keepData?: boolean; 
          keepHistory?: boolean;
          reason?: string;
      },
      @Req() req: any,
  ) {
      const userId = req.user?.id || 'system';
      
      return this.instanceService.resetInstance(
          id,
          userId,
          {
              keepTitle: body?.keepTitle ?? false,
              keepData: body?.keepData ?? true,
              keepHistory: body?.keepHistory ?? false,
              reason: body?.reason,
          }
      );
  }

  // Version simplifiée
  @Post(':id/reset-simple')
  async resetInstanceSimple(
      @Param('id') id: string,
      @Body() body: { reason?: string },
      @Req() req: any,
  ) {
      const userId = req.user?.id || 'system';
      return this.instanceService.resetInstanceSimple(id, userId, body?.reason);
  }
    /**
   * Déclencher un événement sur une instance
   * POST /procedure-instances/:instanceId/events
   */
  @Post(':instanceId/events')
  @ApiOperation({ summary: 'Déclencher un événement sur une instance' })
  @ApiResponse({ status: 200, description: 'Événement traité avec succès' })
  @ApiResponse({ status: 404, description: 'Instance non trouvée' })
  async triggerEvent(
    @Param('instanceId') instanceId: string,
    @Body() triggerEventDto: TriggerEventDto,
    @Req() req,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user?.id || 'system';
    
    await this.instanceService.triggerEventOnInstance(
      instanceId,
      triggerEventDto.eventType,
      triggerEventDto.eventData,
      userId,
    );
    
    return {
      success: true,
      message: `Événement ${triggerEventDto.eventType} déclenché avec succès`,
    };
  }

}