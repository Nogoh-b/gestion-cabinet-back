// controllers/procedure-instance.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ProcedureInstanceService } from '../services/procedure-instance.service';
import { ApplyTransitionDto } from '../dto/apply-transition.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { InstanceStatus } from '../entities/enums/instance-status.enum';
import { ResourcePolicyService } from 'src/core/resource-policy.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('procedure-instances')
export class ProcedureInstanceController {
  constructor(
    private readonly instanceService: ProcedureInstanceService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

    // Récupérer l'utilisateur connecté (à adapter selon votre auth)

  @Get()
  async findAll(
    @Query('status') status?: InstanceStatus,
    @Query('templateId') templateId?: string,
    @Request() req?: any,
  ) {
    const instanceIds =
      await this.resourcePolicy.getAccessibleProcedureInstanceIds(req.user);
    return this.instanceService.findAll({ status, templateId, instanceIds });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    await this.resourcePolicy.assertProcedureInstanceAccess(id, req.user);
    return this.instanceService.findOne(id);
  }

  @Get(':id/workflow')
  async getWorkflowStatus(@Param('id') id: string, @Request() req: any) {
    await this.resourcePolicy.assertProcedureInstanceAccess(id, req.user);
    return this.instanceService.getWorkflowStatus(id);
  }

  /**
  * GET /instances/:id/stages/:stageId
  * Naviguer vers une étape spécifique
  */
  @Get(':id/stages/:stageId')
  async navigateToStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Request() req,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(id, req.user);
    const result = await this.instanceService.navigateToStage(
      id,
      stageId,
    );
    
    return {
      ...result,
      message: result.canCompleteSubStages 
        ? 'Vous pouvez compléter les sous-étapes de cette étape'
        : 'Consultation uniquement',
    };
  }

  /**
 * POST /instances/:id/stages/:stageId/sub-stages/:subStageId/complete
 * Compléter une sous-étape dans une étape précédente
 */
  @Get(':id/transitions')
  async getAvailableTransitions(@Param('id') id: string, @Request() req: any) {
    await this.resourcePolicy.assertProcedureInstanceAccess(id, req.user);
    return this.instanceService.getAvailableTransitionsWithInputs(id);
  }





  @Get(':id/cycles')
  async getAvailableCycles(@Param('id') id: string, @Request() req: any) {
    await this.resourcePolicy.assertProcedureInstanceAccess(id, req.user);
    return this.instanceService.getAvailableCycles(id);
  }

  @Post(':id/sub-stages/:subStageId/complete')
  @RequirePermissions('apply_procedure_transition')
  async completeSubStage(
    @Param('id') id: string,
    @Param('subStageId') subStageId: string,
    @Query('notes') queryNotes: string,
    @Body() body: { notes?: string; metadata?: Record<string, any> },
    @Request() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    const userId = req.user.id;
    // Le front peut envoyer la note via query OU via body — on accepte les deux.
    const notes = body?.notes ?? queryNotes;
    return this.instanceService.completeSubStage(
      id,
      subStageId,
      userId,
      notes,
      body?.metadata,
    );
  }

  @Post(':id/sub-stages/:subStageId/start')
  @RequirePermissions('apply_procedure_transition')
  async startSubStage(
    @Param('id') id: string,
    @Param('subStageId') subStageId: string,
    @Request() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    const userId = req.user.id;
    return this.instanceService.startSubStage(id, subStageId, userId);
  }

  @Post(
    ':id/sub-stages/:subStageId/requirements/:requirementId/approve',
  )
  @RequirePermissions('approve_procedure_requirement')
  async approveSubStageRequirement(
    @Param('id') id: string,
    @Param('subStageId') subStageId: string,
    @Param('requirementId') requirementId: string,
    @Body('comment') comment: string | undefined,
    @Request() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'approve_procedure_requirement',
    );
    return this.instanceService.approveSubStageRequirement(
      id,
      subStageId,
      requirementId,
      req.user.id,
      req.user.role,
      comment,
    );
  }

  @Post(':id/transitions/:transitionId/apply')
  @RequirePermissions('apply_procedure_transition')
  async applyTransition(
    @Param('id') id: string,
    @Param('transitionId') transitionId: string,
    @Body() dto: ApplyTransitionDto,
    @Request() req: any,
  ) {
    // Gérer les fichiers uploadés
      // Uploader les fichiers et récupérer leurs IDs
      // fileIds = await this.uploadService.uploadFiles(files);
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    const userId = req.user.id;
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
  @RequirePermissions('apply_procedure_transition')
  async applyCycle(
    @Param('id') id: string,
    @Param('cycleId') cycleId: string,
    @Request() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    const userId = req.user.id;
    return this.instanceService.applyCycle(id, cycleId, userId);
  }

  @Post(':id/complete')
  @RequirePermissions('apply_procedure_transition')
  async completeInstance(@Param('id') id: string, @Request() req: any) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.instanceService.completeInstance(id, req.user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions('apply_procedure_transition')
  async cancelInstance(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      id,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.instanceService.cancelInstance(id, req.user.id, reason);
  }

}
