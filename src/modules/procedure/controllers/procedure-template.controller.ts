// controllers/procedure-template.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProcedureTemplateService } from '../services/procedure-template.service';
import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';

@Controller('procedure-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage_procedure_templates')
export class ProcedureTemplateController {
  constructor(private readonly templateService: ProcedureTemplateService) {}

  @Post()
  async create(@Body() dto: CreateProcedureTemplateDto) {
    return this.templateService.create(dto);
  }

  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.templateService.findAll(
      activeOnly === undefined ? undefined : activeOnly === 'true',
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateProcedureTemplateDto>) {
    return this.templateService.update(id, dto);
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.templateService.duplicate(id, name);
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string) {
    return this.templateService.publish(id);
  }

  @Post(':id/retire')
  async retire(@Param('id') id: string) {
    return this.templateService.retire(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}
