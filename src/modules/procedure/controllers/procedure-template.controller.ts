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
  Patch
} from '@nestjs/common';
import { ProcedureTemplateService } from '../services/procedure-template.service';
import { CreateProcedureTemplateDto } from '../dto/create-procedure-template.dto';

@Controller('procedure-templates')
export class ProcedureTemplateController {
  constructor(private readonly templateService: ProcedureTemplateService) {}

  @Post()
  async create(@Body() dto: CreateProcedureTemplateDto) {
    return this.templateService.create(dto);
  }

  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.templateService.findAll(true); 
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateProcedureTemplateDto>) {
    return this.templateService.update(id, dto);
  }

   @Patch(':id/toggle-active')
  async toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.templateService.toggleActive(id, isActive);
  }

  @Post(':id/duplicate')
  async duplicate(
    @Param('id') id: string,
    @Body('name') name: string,
  ) {
    return this.templateService.duplicate(id, name);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.templateService.remove(id);
  }
}