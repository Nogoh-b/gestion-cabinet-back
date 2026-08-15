// activities-user.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ActivitiesUserService } from './activities-user.service';

@ApiTags('User Activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activities-user')
export class ActivitiesUserController {
  constructor(private readonly activitiesService: ActivitiesUserService) {}

  /** Réservé aux administrateurs / super-admin. */
  private assertAdmin(req: any): void {
    const role = req?.user?.role;
    const perms: string[] = req?.user?.permissions ?? [];
    if (role !== 'admin' && !perms.includes('SUPER_ADMIN')) {
      throw new ForbiddenException("Accès réservé à l'administration");
    }
  }

  /** Journal d'audit du cabinet (filtré + paginé). */
  @Get('audit')
  @ApiOperation({ summary: "Journal d'audit du cabinet (admin)" })
  audit(
    @Request() req: any,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertAdmin(req);
    return this.activitiesService.findPaginated({
      userId: userId ? Number(userId) : undefined,
      action,
      resource,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Activités récentes d’un utilisateur' })
  getUserActivities(@Request() req: any, @Param('userId') userId: string) {
    this.assertAdmin(req);
    return this.activitiesService.getUserActivities(+userId);
  }
}
