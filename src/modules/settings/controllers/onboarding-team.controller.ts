import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { OnboardingTeamResetDto, OnboardingTourEventDto } from '../dto/onboarding-events.dto';
import { OnboardingTeamService } from '../services/onboarding-team.service';

function caller(req: Request): { tenantId: number; userId: number } {
  const user = req.user as any;
  return { tenantId: Number(user?.tenantId), userId: Number(user?.id) };
}

/** Visites guidées : journal de l'utilisateur, suivi de l'équipe par l'administrateur. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OnboardingTeamController {
  constructor(private readonly team: OnboardingTeamService) {}

  @Post('events')
  @HttpCode(204)
  @ApiOperation({ summary: 'Enregistrer une visite guidée terminée ou abandonnée' })
  async event(@Req() req: Request, @Body() dto: OnboardingTourEventDto) {
    const { tenantId, userId } = caller(req);
    await this.team.recordEvent(tenantId, userId, dto);
  }

  @Get('team')
  @RequirePermissions('edit_user')
  @ApiOperation({ summary: 'Progression des visites guidées de chaque membre du cabinet' })
  async members(@Req() req: Request) {
    return this.team.team(caller(req).tenantId);
  }

  @Post('team/reset')
  @RequirePermissions('edit_user')
  @ApiOperation({ summary: 'Remettre à zéro les visites de membres choisis, ou de toute l’équipe' })
  async reset(@Req() req: Request, @Body() dto: OnboardingTeamResetDto) {
    return this.team.reset(caller(req).tenantId, dto.user_ids);
  }
}
