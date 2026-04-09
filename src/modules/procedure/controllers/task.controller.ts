// controllers/task.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param, Req
} from '@nestjs/common';
import { TaskService } from '../services/task.service';
import { CreateTaskDto } from '../dto/create-task.dto';

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('instances/:instanceId')
  async create(@Param('instanceId') instanceId: string, @Body() dto: CreateTaskDto) {
    return this.taskService.create(instanceId, dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }

  @Put(':id/complete')
  async complete(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || 'system';
    return this.taskService.complete(id, userId);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: any) {
    return this.taskService.updateStatus(id, status);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.taskService.delete(id);
  }
}