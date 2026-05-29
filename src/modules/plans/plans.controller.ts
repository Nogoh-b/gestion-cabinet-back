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
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PlansService } from './plans.service';
import { PlanQuotaService } from './plan-quota.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanSearchDto } from './dto/plan-search.dto';
import { Plan } from './entities/plan.entity';

@ApiTags('Plans')
@Controller('plans')
@ApiBearerAuth()
export class PlansController {
  constructor(
    private readonly service: PlansService,
    private readonly quotaService: PlanQuotaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create_plan')
  @ApiOperation({ summary: 'Créer un plan' })
  create(@Body() dto: CreatePlanDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_plans')
  @ApiOperation({ summary: 'Lister les plans (paginé)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des plans', type: [Plan] })
  async findAll(@Query() params: PlanSearchDto) {
    return this.service.searchWithTransformer(params as any, Plan, params as any);
  }

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
  @ApiOperation({ summary: 'État d\'utilisation du plan du cabinet courant' })
  async getMyQuotaStatus(@Request() req: any) {
    const cabinetId: number = req.user?.tenantId;
    return this.service.getQuotaStatus(cabinetId);
  }

  /**
   * PATCH /plans/cabinet/:cabinetId/assign/:planId
   * Assigne un plan à un cabinet (admin super).
   */
  @Patch('/cabinet/:cabinetId/assign/:planId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('manage_cabinets')
  @ApiOperation({ summary: 'Assigner un plan à un cabinet' })
  assignPlanToCabinet(
    @Param('cabinetId') cabinetId: string,
    @Param('planId') planId: string,
  ) {
    return this.service.assignPlanToCabinet(+cabinetId, +planId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_plans')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_plan')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_plan')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
