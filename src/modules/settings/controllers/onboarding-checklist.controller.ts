import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { OnboardingChecklistService } from '../services/onboarding-checklist.service';

/** Liste « Premiers pas » du compte connecté (comptes du cabinet seulement). */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/onboarding/checklist')
export class OnboardingChecklistController {
  constructor(private readonly checklist: OnboardingChecklistService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Étapes de démarrage déjà accomplies' })
  async get(@Req() req: Request) {
    return this.checklist.get(Number((req.user as any)?.id));
  }
}
