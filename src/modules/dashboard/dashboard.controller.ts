// src/modules/dashboard/controllers/dashboard.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';
import { DashboardService } from './dashboard.service';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

@ApiTags('dashboard')
@Controller('dashboard')
// @UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les données pour l\'overview du dashboard' })
  @ApiResponse({ status: 200, type: DashboardOverviewDto })
  async getOverview(): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview();
  }
}