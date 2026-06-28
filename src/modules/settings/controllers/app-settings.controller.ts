import { Controller, Get, Put, Post, UseGuards, Req, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AppSettingsService } from '../services/app-settings.service';
import { AppSettingsDto } from '../dto/app-settings.dto';
import { serializeCabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { SmtpService } from 'src/core/shared/emails/smtp.service';
import { Request } from 'express';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/settings/app')
export class AppSettingsController {
  constructor(
    private readonly appSettingsService: AppSettingsService,
    private readonly smtpService: SmtpService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer les paramètres du cabinet' })
  async get(@Req() req: Request) {
    // tenantId est posé par JwtStrategy depuis le payload JWT
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    return serializeCabinet(await this.appSettingsService.findByCabinet(cabinetId));
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour les paramètres du cabinet' })
  async update(@Req() req: Request, @Body() dto: AppSettingsDto) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    return serializeCabinet(await this.appSettingsService.update(cabinetId, dto));
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Réinitialiser les paramètres du cabinet' })
  async reset(@Req() req: Request) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    return serializeCabinet(await this.appSettingsService.reset(cabinetId));
  }

  @Post('smtp/test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Envoyer un e-mail de test avec le SMTP du cabinet' })
  async testSmtp(@Req() req: Request, @Body() body: { to?: string }) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const to = body?.to || (req.user as any)?.email;
    return this.smtpService.sendTest(cabinetId, to);
  }
}
