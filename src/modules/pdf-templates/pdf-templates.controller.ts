import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreatePdfTemplateDto } from './dto/create-pdf-template.dto';
import { PdfTemplateSearchDto } from './dto/pdf-template-search.dto';
import { UpdatePdfTemplateDto } from './dto/update-pdf-template.dto';
import { PdfTemplate } from './entities/pdf-template.entity';
import { PdfTemplatesService } from './pdf-templates.service';

@ApiTags('PDF Templates')
@Controller('pdf-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PdfTemplatesController {
  constructor(private readonly service: PdfTemplatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create_pdf_template')
  @ApiOperation({ summary: 'Créer un modèle PDF' })
  create(@Body() dto: CreatePdfTemplateDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_pdf_templates')
  @ApiOperation({ summary: 'Lister les modèles PDF (paginé)' })
  @ApiResponse({ status: 200, type: [PdfTemplate] })
  async findAll(@Query() params: PdfTemplateSearchDto) {
    return this.service.searchWithTransformer(params as any, PdfTemplate, params as any);
  }

  @Get('/active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Modèles PDF actifs (sans pagination)' })
  findActive() {
    return this.service.findActive();
  }

  @Get('/by-entity/:entityType')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Modèles actifs d\'un type d\'entité (ex. facture)' })
  findByEntity(@Param('entityType') entityType: string) {
    return this.service.findByEntity(entityType);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_pdf_templates')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_pdf_template')
  update(@Param('id') id: string, @Body() dto: UpdatePdfTemplateDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_pdf_template')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
