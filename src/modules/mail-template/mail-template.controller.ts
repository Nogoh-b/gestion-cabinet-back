import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TemplateContextService } from './template-context.service';
import { TEMPLATE_LIST_GROUP } from './template-context';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { MailTemplateService } from './mail-template.service';
import { CreateMailTemplateDto } from './dto/create-mail-template.dto';
import { UpdateMailTemplateDto } from './dto/update-mail-template.dto';
import { MAIL_VARIABLE_GROUPS } from './mail-variables';

@ApiTags('Mail Templates')
@Controller('mail-templates')
@ApiBearerAuth()
export class MailTemplateController {
  constructor(
    private readonly service: MailTemplateService,
    private readonly templateContext: TemplateContextService,
  ) {}

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

  /**
   * Catalogue des variables disponibles dans les templates.
   * Utilisé par l'éditeur de templates côté front pour proposer
   * l'auto-complétion / l'insertion de variables.
   */
  @Get('/variables')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Catalogue des variables de template namespacées' })
  getVariables() {
    return [...MAIL_VARIABLE_GROUPS, TEMPLATE_LIST_GROUP];
  }

  /**
   * Contexte complet d'une fiche pour remplir un modèle (PDF, mail composé) :
   * variables de la fiche, listes et totaux de son dossier, selon les droits.
   */
  @Get('/context/:type/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Variables, listes et totaux d'une fiche pour un modèle" })
  getContext(@Param('type') type: string, @Param('id') id: string, @Req() req: Request) {
    if (!TemplateContextService.isEntityType(type)) throw new BadRequestException(`Type de fiche inconnu : ${type}`);
    return this.templateContext.build(type, id, { user: req.user });
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
