// controllers/task.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseEnumPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TaskService } from '../services/task.service';
import { CreateTaskDto } from '../dto/create-task.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ResourcePolicyService } from 'src/core/resource-policy.service';
import { TaskStatus } from '../entities/enums/instance-status.enum';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  @Post('instances/:instanceId')
  @RequirePermissions('apply_procedure_transition')
  async create(
    @Param('instanceId') instanceId: string,
    @Body() dto: CreateTaskDto,
    @Req() req: any,
  ) {
    await this.resourcePolicy.assertProcedureInstanceAccess(
      instanceId,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.taskService.create(instanceId, dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const task = await this.taskService.findOne(id);
    await this.resourcePolicy.assertProcedureInstanceAccess(
      task.instanceId,
      req.user,
    );
    return task;
  }

  @Put(':id/complete')
  @RequirePermissions('apply_procedure_transition')
  async complete(@Param('id') id: string, @Req() req: any) {
    const task = await this.taskService.findOne(id);
    await this.resourcePolicy.assertProcedureInstanceAccess(
      task.instanceId,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.taskService.complete(id, String(req.user.id));
  }

  @Put(':id/status')
  @RequirePermissions('apply_procedure_transition')
  async updateStatus(
    @Param('id') id: string,
    @Body('status', new ParseEnumPipe(TaskStatus)) status: TaskStatus,
    @Req() req: any,
  ) {
    const task = await this.taskService.findOne(id);
    await this.resourcePolicy.assertProcedureInstanceAccess(
      task.instanceId,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.taskService.updateStatus(id, status, String(req.user.id));
  }

  @Delete(':id')
  @RequirePermissions('apply_procedure_transition')
  async delete(@Param('id') id: string, @Req() req: any) {
    const task = await this.taskService.findOne(id);
    await this.resourcePolicy.assertProcedureInstanceAccess(
      task.instanceId,
      req.user,
      'write',
      'apply_procedure_transition',
    );
    return this.taskService.delete(id, String(req.user.id));
  }
}
