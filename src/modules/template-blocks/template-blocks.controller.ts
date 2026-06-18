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
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { TemplateBlocksService } from './template-blocks.service';
import { CreateTemplateBlockDto } from './dto/create-template-block.dto';
import { UpdateTemplateBlockDto } from './dto/update-template-block.dto';
import { TemplateBlock } from './entities/template-block.entity';

@ApiTags('Template Blocks')
@Controller('template-blocks')
@ApiBearerAuth()
export class TemplateBlocksController {
  constructor(private readonly service: TemplateBlocksService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_pdf_template')
  @ApiOperation({ summary: 'Créer un bloc en-tête / pied de page' })
  create(@Body() dto: CreateTemplateBlockDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lister tous les blocs (actifs + inactifs)' })
  @ApiResponse({ status: 200, type: [TemplateBlock] })
  findAll() {
    return this.service.findAll();
  }

  @Get('/active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Blocs actifs uniquement' })
  findActive(@Query('channel') channel?: 'mail' | 'pdf') {
    if (channel === 'mail' || channel === 'pdf') {
      return this.service.findByChannel(channel);
    }
    return this.service.findActive();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_pdf_template')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateBlockDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_pdf_template')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
