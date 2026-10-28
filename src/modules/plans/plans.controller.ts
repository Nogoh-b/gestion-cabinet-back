import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AllowSuspended } from 'src/core/decorators/allow-suspended.decorator';
import { PlansService } from './plans.service';
import { PlanQuotaService } from './plan-quota.service';

@ApiTags('Plans')
@Controller('plans')
@ApiBearerAuth()
export class PlansController {
  constructor(
    private readonly service: PlansService,
    private readonly quotaService: PlanQuotaService,
  ) {}

  @Get('/active')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Plans actifs (sans pagination)' })
  findActive() {
    return this.service.findActive();
  }

  /**
   * GET /plans/quota/status
   * Retourne l'état d'utilisation du plan du cabinet courant.
   * Utilisé par le front pour afficher les barres de progression.
   */
  @Get('/quota/status')
  @UseGuards(JwtAuthGuard)
  @AllowSuspended()
  @ApiOperation({ summary: "État d'utilisation du plan du cabinet courant" })
  async getMyQuotaStatus(@Request() req: any) {
    const cabinetId: number = req.user?.tenantId;
    return this.service.getQuotaStatus(cabinetId);
  }

  // Le catalogue des plans (création, modification, désactivation) et
  // l'affectation d'un plan à un cabinet relèvent de l'espace plateforme :
  // /platform/plans et /platform/cabinets/:id/change-plan.
}
