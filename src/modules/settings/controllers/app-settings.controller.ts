import {
  BadRequestException,
  Controller,
  Get,
  Put,
  Post,
  UseGuards,
  Req,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AppSettingsService } from '../services/app-settings.service';
import { AppSettingsDto } from '../dto/app-settings.dto';
import { SmtpService } from 'src/core/shared/emails/smtp.service';
import { Request } from 'express';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/settings/app')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('manage_settings')
export class AppSettingsController {
  constructor(
    private readonly appSettingsService: AppSettingsService,
    private readonly smtpService: SmtpService,
  ) {}

  private tenantOf(req: Request): number {
    const cabinetId = Number((req.user as any)?.tenantId);
    if (!Number.isInteger(cabinetId) || cabinetId <= 0) {
      throw new BadRequestException('Cabinet authentifié introuvable.');
    }
    return cabinetId;
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer les paramètres du cabinet' })
  async get(@Req() req: Request) {
    const cabinet = await this.appSettingsService.findByCabinet(this.tenantOf(req));
    return this.appSettingsService.toResponse(cabinet);
  }

  @Put()
  @ApiOperation({ summary: 'Mettre à jour les paramètres du cabinet' })
  async update(@Req() req: Request, @Body() dto: AppSettingsDto) {
    const cabinet = await this.appSettingsService.update(this.tenantOf(req), dto);
    return this.appSettingsService.toResponse(cabinet);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Réinitialiser les paramètres du cabinet' })
  async reset(@Req() req: Request) {
    const cabinet = await this.appSettingsService.reset(this.tenantOf(req));
    return this.appSettingsService.toResponse(cabinet);
  }

  @Post('smtp/test')
  @ApiOperation({ summary: 'Envoyer un e-mail de test avec le SMTP du cabinet' })
  async testSmtp(@Req() req: Request, @Body() body: { to?: string }) {
    const to = body?.to || (req.user as any)?.email;
    return this.smtpService.sendTest(this.tenantOf(req), to);
  }
}
