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
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';
import { ProcedureTemplateService } from '../services/procedure-template.service';

@ApiBearerAuth()
@ApiTags('procedure-templates')
@Controller('procedure-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage_procedure_templates')
export class ProcedureTemplateController {
  constructor(private readonly templateService: ProcedureTemplateService) {}

  @Post()
  @RequirePermissions('manage_settings')
  async create(@Body() dto: CreateProcedureTemplateDto) {
    return this.templateService.create(dto);
  }

  @Get()
  @RequirePermissions('view_dossiers')
  async findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('procedure_type_id') procedureTypeId?: string,
  ) {
    if (procedureTypeId !== undefined) {
      const parsedProcedureTypeId = Number(procedureTypeId);
      if (
        !Number.isInteger(parsedProcedureTypeId) ||
        parsedProcedureTypeId < 1
      ) {
        throw new BadRequestException(
          'procedure_type_id doit être un entier positif',
        );
      }
      return this.templateService.findByProcedureTypeId(parsedProcedureTypeId);
    }
    return this.templateService.findAll(
      activeOnly === undefined ? undefined : activeOnly === 'true',
    );
  }

  @Get(':id')
  @RequirePermissions('view_dossiers')
  async findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('manage_settings')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateProcedureTemplateDto>,
  ) {
    return this.templateService.update(id, dto);
  }

  @Post(':id/duplicate')
  @RequirePermissions('manage_settings')
  async duplicate(@Param('id') id: string, @Body('name') name: string) {
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
  @RequirePermissions('manage_settings')
  async remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}
