import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformAssistantService } from './platform-assistant.service';

class AskPlatformAssistantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  question: string;

  /** Page ouverte dans la console (contexte de la question). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pathname?: string;
}

const PROPOSAL = { targetType: 'assistant_proposal' };

/**
 * Assistant de la console, ouvert à tous les rôles plateforme : le rôle est
 * contrôlé outil par outil, puis action par action à l'acceptation.
 */
@ApiTags('Plateforme — Assistant')
@Controller('platform/assistant')
@PlatformRoute()
export class PlatformAssistantController {
  constructor(private readonly service: PlatformAssistantService) {}

  @Get('history')
  @ApiOperation({ summary: 'Historique et propositions en attente de cet administrateur' })
  history(@CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.service.history(admin.id);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @PlatformAudit({ action: 'assistant.ask' })
  @ApiOperation({ summary: 'Poser une question ; une action éventuelle reste à confirmer' })
  ask(
    @Body() dto: AskPlatformAssistantDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.ask(dto.question, dto.pathname, admin);
  }

  @Post('proposals/:id/accept')
  @HttpCode(HttpStatus.OK)
  @PlatformAudit({ action: 'assistant.proposal.accept', ...PROPOSAL })
  @ApiOperation({ summary: 'Exécuter une proposition (rôle revérifié)' })
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.accept(id, admin);
  }

  @Post('proposals/:id/reject')
  @HttpCode(HttpStatus.OK)
  @PlatformAudit({ action: 'assistant.proposal.reject', ...PROPOSAL })
  @ApiOperation({ summary: 'Écarter une proposition' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.reject(id, admin.id);
  }
}
