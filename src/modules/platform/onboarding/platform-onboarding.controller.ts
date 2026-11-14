import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformOnboardingService } from './platform-onboarding.service';

/** Prise en main des cabinets : visites guidées et Premiers pas. Lecture : tous les rôles. */
@ApiTags('Plateforme — Prise en main')
@Controller('platform/onboarding')
@PlatformRoute()
export class PlatformOnboardingController {
  constructor(private readonly onboarding: PlatformOnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'Réussite des visites guidées, abandons par étape et avancement des cabinets' })
  overview(@Query('days') days?: string) {
    return this.onboarding.overview(days);
  }
}
