import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { MailTemplateService } from './mail-template.service';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';

@ApiTags('Mail Templates')
@Controller('mail-templates')
@ApiBearerAuth()
export class MailTemplateController {
  constructor(private readonly service: MailTemplateService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Créer un template de mail' })
  create(@Body() dto: CreateMailTemplateDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lister les templates de mail' })
  findAll() {
    return this.service.findAll();
  }

  @Get('/active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Templates actifs' })
  findActive() {
    return this.service.findActive();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post(':id/preview')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Prévisualiser le rendu (avec branding cabinet)' })
  preview(@Param('id') id: string, @Body() context: Record<string, any>) {
    return this.service.preview(+id, context ?? {});
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateMailTemplateDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
