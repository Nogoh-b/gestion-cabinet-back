// src/modules/dashboard/controllers/dashboard.controller.ts
import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';
import { DashboardService, seesFinancialOverview } from './dashboard.service';
import { DashboardWatchlistService } from './dashboard-watchlist.service';
import {
  isWatchlistType,
  WATCHLIST_TYPES,
  WatchlistPageDto,
} from './dto/watchlist.dto';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import type { RestrictedFieldsUser } from 'src/core/security/restricted-fields';

const WATCHLIST_MAX_LIMIT = 100;

@ApiTags('dashboard')
@Controller('dashboard')
// @UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly watchlistService: DashboardWatchlistService,
  ) {}

  @Get('overview')
  @RequirePermissions('view_dashboard')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: "Obtenir les données pour l'overview du dashboard" })
  @ApiResponse({ status: 200, type: DashboardOverviewDto })
  async getOverview(
    @CurrentUser() user: RestrictedFieldsUser,
  ): Promise<DashboardOverviewDto> {
    // L'utilisateur décide de la section financière (droits sur les factures).
    return this.dashboardService.getOverview(user);
  }

  @Get('watchlist/:type')
  @RequirePermissions('view_dashboard')
  @ApiOperation({
    summary: 'Liste paginée derrière un chip « À surveiller » du dashboard',
  })
  @ApiResponse({ status: 200, type: WatchlistPageDto })
  async getWatchlist(
    @CurrentUser() user: RestrictedFieldsUser,
    @Param('type') type: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<WatchlistPageDto> {
    if (!isWatchlistType(type)) {
      throw new BadRequestException(
        `Type inconnu. Valeurs possibles : ${WATCHLIST_TYPES.join(', ')}`,
      );
    }
    // Même règle que le compteur du tableau de bord : sans droit financier,
    // le chip des factures n'est pas affiché et la liste reste fermée.
    if (type === 'factures-impayees' && !seesFinancialOverview(user)) {
      throw new ForbiddenException(
        'Accès aux factures non autorisé (view_factures requis)',
      );
    }
    return this.watchlistService.list(
      type,
      Math.max(1, page),
      Math.min(WATCHLIST_MAX_LIMIT, Math.max(1, limit)),
    );
  }
}
