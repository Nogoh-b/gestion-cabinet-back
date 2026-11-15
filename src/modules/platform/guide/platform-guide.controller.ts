import { Body, Controller, Delete, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { GUIDE_KINDS, GUIDE_TARGET_PATTERN, GuideKind } from 'src/modules/guide/guide-overrides';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { CurrentPlatformAdmin, PlatformPrincipal } from '../common/platform-principal';
import { PlatformGuideService } from './platform-guide.service';

class GuideRefDto {
  @IsIn(GUIDE_KINDS)
  kind: GuideKind;

  @IsString()
  @Matches(GUIDE_TARGET_PATTERN)
  target: string;
}

class GuideDraftDto extends GuideRefDto {
  @IsObject()
  draft: Record<string, any>;
}

class GuideItemsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GuideRefDto)
  items: GuideRefDto[];
}

class GuidePublishDto extends GuideItemsDto {
  /** Visites à faire revoir aux utilisateurs qui les ont déjà vues. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(GUIDE_TARGET_PATTERN, { each: true })
  replay_tours?: string[];
}

/**
 * Éditeur « Prise en main » : visites, bulles, astuces, fiches d'aide et
 * nouveautés appliquées à tous les cabinets.
 * Lecture : tous les rôles ; écriture : Propriétaire ou Support.
 */
@ApiTags('Plateforme — Prise en main (éditeur)')
@Controller('platform/guide')
@PlatformRoute()
export class PlatformGuideController {
  constructor(private readonly guide: PlatformGuideService) {}

  @Get('overrides')
  @ApiOperation({ summary: 'Modifications enregistrées (publiées et brouillons)' })
  list() {
    return this.guide.list();
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Permissions, métiers et modules du forfait utilisables pour cibler un contenu' })
  catalog() {
    return this.guide.catalog();
  }

  @Put('overrides')
  @PlatformRoles('owner', 'support')
  @ApiOperation({ summary: 'Enregistre un brouillon' })
  saveDraft(@Body() body: GuideDraftDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.guide.saveDraft({ kind: body.kind, target: body.target }, body.draft, admin.id);
  }

  @Post('publish')
  @PlatformRoles('owner', 'support')
  @PlatformAudit({ action: 'guide.publish', targetType: 'guide_override' })
  @ApiOperation({ summary: 'Publie des brouillons pour tous les cabinets' })
  publish(@Body() body: GuidePublishDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.guide.publish(body.items, body.replay_tours ?? [], admin.id);
  }

  @Post('discard')
  @PlatformRoles('owner', 'support')
  @ApiOperation({ summary: 'Abandonne des brouillons' })
  discard(@Body() body: GuideItemsDto) {
    return this.guide.discard(body.items);
  }

  @Delete('overrides')
  @PlatformRoles('owner', 'support')
  @PlatformAudit({ action: 'guide.revert', targetType: 'guide_override' })
  @ApiOperation({ summary: 'Revient au contenu d’origine (ou supprime une création)' })
  remove(@Query() query: GuideRefDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.guide.remove({ kind: query.kind, target: query.target }, admin.id);
  }
}
