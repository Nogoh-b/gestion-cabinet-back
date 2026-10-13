import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformAdminsService } from './platform-admins.service';
import {
  InvitePlatformAdminDto,
  UpdatePlatformAdminDto,
} from './dto/platform-admin.dto';

@ApiTags('Plateforme — Administrateurs')
@Controller('platform/admins')
@PlatformRoute('owner')
export class PlatformAdminsController {
  constructor(private readonly service: PlatformAdminsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les comptes plateforme' })
  list() {
    return this.service.list();
  }

  @Post()
  @PlatformAudit({ action: 'admin.invite', targetType: 'platform_admin' })
  @ApiOperation({ summary: 'Inviter un administrateur plateforme' })
  invite(
    @Body() dto: InvitePlatformAdminDto,
    @CurrentPlatformAdmin() actor: PlatformPrincipal,
  ) {
    return this.service.invite(dto, actor);
  }

  @Patch(':id')
  @PlatformAudit({ action: 'admin.update', targetType: 'platform_admin' })
  @ApiOperation({ summary: 'Modifier nom, rôle ou statut' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlatformAdminDto,
    @CurrentPlatformAdmin() actor: PlatformPrincipal,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post(':id/resend-access')
  @PlatformAudit({ action: 'admin.resend_access', targetType: 'platform_admin' })
  @ApiOperation({ summary: "Renvoyer l'invitation ou un lien de réinitialisation" })
  resendAccess(@Param('id', ParseIntPipe) id: number) {
    return this.service.resendAccess(id);
  }
}
