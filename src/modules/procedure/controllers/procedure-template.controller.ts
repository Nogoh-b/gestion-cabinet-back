// controllers/procedure-template.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { ProcedureTemplateService } from '../services/procedure-template.service';

@ApiBearerAuth()
@ApiTags('procedure-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('procedure-templates')
export class ProcedureTemplateController {
  constructor(private readonly templateService: ProcedureTemplateService) {}

  @Post()
  @RequirePermissions('manage_settings')
  async create(@Body() dto: CreateProcedureTemplateDto) {
    return this.templateService.create(dto);
  }

  @Get()
  @RequirePermissions('view_dossiers')
  async findAll(@Query('activeOnly') activeOnly?: string) {
    const activeFilter =
      activeOnly === undefined ? undefined : ['true', '1', 'yes'].includes(String(activeOnly).toLowerCase());
    return this.templateService.findAll(activeFilter);
  }

  @Get(':id')
  @RequirePermissions('view_dossiers')
  async findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('manage_settings')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateProcedureTemplateDto>) {
    return this.templateService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @RequirePermissions('manage_settings')
  async toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.templateService.toggleActive(id, isActive);
  }

  @Post(':id/duplicate')
  @RequirePermissions('manage_settings')
  async duplicate(
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.templateService.duplicate(id, name);
  }

  @Delete(':id')
  @RequirePermissions('manage_settings')
  async remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}
