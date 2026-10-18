import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformAiService } from './platform-ai.service';

class AiChoiceDto {
  @IsString()
  @MaxLength(80)
  provider_id: string;

  @IsString()
  @MaxLength(160)
  model: string;
}

class CustomAiProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  api_key?: string;
}

class TestAiProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;
}

/**
 * Module IA de la plateforme : moteur par défaut des cabinets, catalogue des
 * fournisseurs et exceptions par cabinet. Lecture : tous les rôles ;
 * modification : Propriétaire uniquement (comme les paramètres plateforme).
 */
@ApiTags('Plateforme — Intelligence artificielle')
@Controller('platform/ai')
@PlatformRoute()
export class PlatformAiController {
  constructor(private readonly ai: PlatformAiService) {}

  @Get()
  @ApiOperation({ summary: 'Moteur par défaut, fournisseurs et exceptions par cabinet' })
  overview() {
    return this.ai.overview();
  }

  @Put('default')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.default.update', targetType: 'platform_ai' })
  @ApiOperation({ summary: 'Choisit le moteur IA par défaut de tous les cabinets' })
  setDefault(@Body() body: AiChoiceDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.ai.setDefault(body.provider_id, body.model, admin.id);
  }

  @Delete('default')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.default.clear', targetType: 'platform_ai' })
  @ApiOperation({ summary: 'Revient à la configuration IA du serveur (variables d’environnement)' })
  clearDefault(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.ai.clearDefault(admin.id);
  }

  @Post('providers')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.provider.create', targetType: 'platform_ai_provider' })
  @ApiOperation({ summary: 'Ajoute un fournisseur compatible OpenAI' })
  createProvider(@Body() body: CustomAiProviderDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.ai.createProvider(body, admin.id);
  }

  @Put('providers/:id')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.provider.update', targetType: 'platform_ai_provider' })
  @ApiOperation({ summary: 'Modifie un fournisseur personnalisé' })
  updateProvider(
    @Param('id') id: string,
    @Body() body: CustomAiProviderDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.updateProvider(id, body, admin.id);
  }

  @Delete('providers/:id')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.provider.delete', targetType: 'platform_ai_provider' })
  @ApiOperation({ summary: 'Supprime un fournisseur personnalisé' })
  deleteProvider(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.ai.deleteProvider(id, admin.id);
  }

  @Post('providers/:id/test')
  @PlatformRoles('owner', 'support')
  @PlatformAudit({ action: 'ai.provider.test', targetType: 'platform_ai_provider' })
  @ApiOperation({ summary: 'Teste la connexion à un fournisseur (petite requête)' })
  testProvider(@Param('id') id: string, @Body() body: TestAiProviderDto) {
    return this.ai.testProvider(id, body?.model);
  }

  @Post('knowledge-documents')
  @PlatformRoles('owner')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @PlatformAudit({
    action: 'ai.knowledge.import',
    targetType: 'legal_knowledge_document',
  })
  @ApiOperation({
    summary: 'Importe un PDF dans la base de connaissance juridique du chat',
  })
  importKnowledgeDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.importLegalKnowledgePdf(file, admin.id);
  }

  @Delete('knowledge-documents/:id')
  @PlatformRoles('owner')
  @PlatformAudit({
    action: 'ai.knowledge.delete',
    targetType: 'legal_knowledge_document',
    targetParam: 'id',
  })
  @ApiOperation({
    summary: 'Supprime un PDF de la base de connaissance juridique',
  })
  deleteKnowledgeDocument(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.ai.deleteLegalKnowledgeDocument(id, admin.id);
  }

  @Get('cabinets/:cabinetId')
  @ApiOperation({ summary: 'Moteur IA d’un cabinet (exception ou défaut plateforme)' })
  cabinet(@Param('cabinetId', ParseIntPipe) cabinetId: number) {
    return this.ai.cabinetOverride(cabinetId);
  }

  @Put('cabinets/:cabinetId')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.cabinet_override.update', targetType: 'cabinet', cabinetParam: 'cabinetId', targetParam: 'cabinetId' })
  @ApiOperation({ summary: 'Pose une exception : moteur IA propre à ce cabinet' })
  setCabinet(@Param('cabinetId', ParseIntPipe) cabinetId: number, @Body() body: AiChoiceDto) {
    return this.ai.setCabinetOverride(cabinetId, body.provider_id, body.model);
  }

  @Delete('cabinets/:cabinetId')
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'ai.cabinet_override.clear', targetType: 'cabinet', cabinetParam: 'cabinetId', targetParam: 'cabinetId' })
  @ApiOperation({ summary: 'Retire l’exception : le cabinet suit le moteur par défaut' })
  clearCabinet(@Param('cabinetId', ParseIntPipe) cabinetId: number) {
    return this.ai.clearCabinetOverride(cabinetId);
  }
}
