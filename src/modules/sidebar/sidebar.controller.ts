import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { SidebarCountsDto } from './sidebar-counts.dto';
import {
  SidebarCountsService,
  type SidebarCountsUser,
} from './sidebar-counts.service';

@ApiTags('sidebar')
@Controller('sidebar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SidebarController {
  constructor(private readonly service: SidebarCountsService) {}

  /**
   * Compteurs des badges de la sidebar. Vides (`enabled: false`) tant que la
   * plateforme n'a pas activé les badges pour le cabinet ; sinon filtrés par
   * les droits et la portée de l'utilisateur, en cache 60 s.
   */
  @Get('counts')
  @ApiOperation({ summary: 'Compteurs des badges de la sidebar' })
  @ApiResponse({ status: 200, type: SidebarCountsDto })
  getCounts(
    @CurrentUser() user: SidebarCountsUser & { tenantId: number },
  ): Promise<SidebarCountsDto> {
    return this.service.getCounts(user, user.tenantId);
  }
}
