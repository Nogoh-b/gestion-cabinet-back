import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AllowSuspended } from 'src/core/decorators/allow-suspended.decorator';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
  requestIp,
} from '../common/platform-principal';
import { PlatformImpersonationService } from './platform-impersonation.service';

export class StartImpersonationDto {
  @IsOptional() @IsInt()
  user_id?: number;

  @IsString() @MinLength(5) @MaxLength(500)
  reason: string;
}

@ApiTags('Plateforme — Connexion « en tant que »')
@Controller('platform')
@PlatformRoute('support')
export class PlatformImpersonationController {
  constructor(private readonly service: PlatformImpersonationService) {}

  @Post('cabinets/:id/impersonate')
  @HttpCode(HttpStatus.OK)
  @PlatformAudit({ action: 'impersonation.start', targetType: 'cabinet_user', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Ouvrir une session support (1 h) au nom d’un utilisateur du cabinet' })
  start(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartImpersonationDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Req() req: any,
  ) {
    return this.service.start(id, { userId: dto.user_id, reason: dto.reason }, admin, requestIp(req));
  }

  @Get('impersonations')
  @ApiOperation({ summary: 'Sessions support (filtres cabinet, actives)' })
  list(@Query('cabinetId') cabinetId?: string, @Query('active') active?: string) {
    return this.service.list({
      cabinetId: cabinetId ? Number(cabinetId) : undefined,
      active: active === 'true',
    });
  }

  @Post('impersonations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'impersonation.revoke', targetType: 'impersonation' })
  revoke(@Param('id', ParseIntPipe) id: number, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    return this.service.revoke(id, admin);
  }
}

/** Fin de session support depuis l'onglet du cabinet (jeton « en tant que »). */
@ApiTags('Auth')
@Controller('auth/impersonation')
@AllowSuspended()
@UseGuards(JwtAuthGuard)
export class TenantImpersonationController {
  constructor(private readonly service: PlatformImpersonationService) {}

  @Post('end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminer la session support en cours' })
  end(@Req() req: any) {
    const sessionId = req.user?.impersonation?.sessionId;
    if (!sessionId) throw new ForbiddenException('Aucune session support en cours.');
    return this.service.endFromTenant(sessionId);
  }
}
