import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AppSettingsService } from '../services/app-settings.service';
import { AppSettingsDto } from '../dto/app-settings.dto';
import { serializeCabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { SmtpService } from 'src/core/shared/emails/smtp.service';
import { Request } from 'express';

function maskAiConfigForResponse(cabinet: any): any {
  if (!cabinet?.ai_config) return cabinet;
  try {
    const masked = JSON.parse(JSON.stringify(cabinet.ai_config));
    const mask = () => '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    const needsMask = (v?: string) => !!v && !v.includes('\u2022');
    if (needsMask(masked.api_key)) masked.api_key = mask();
    if (masked.providers) {
      for (const p of Object.keys(masked.providers)) {
        if (needsMask(masked.providers[p]?.api_key))
          masked.providers[p].api_key = mask();
      }
    }
    return { ...cabinet, ai_config: masked };
  } catch {
    return cabinet;
  }
}

function isAdminRequest(req: Request): boolean {
  const user = req.user as any;
  return (
    user?.role === 'admin' ||
    (Array.isArray(user?.permissions) &&
      user.permissions.includes('SUPER_ADMIN'))
  );
}

function settingsResponse(cabinet: any, req: Request): any {
  if (isAdminRequest(req)) return maskAiConfigForResponse(cabinet);
  const copy = { ...cabinet };
  delete copy.ai_config;
  return copy;
}

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
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const cabinet = await this.appSettingsService.findByCabinet(cabinetId);
    return serializeCabinet(settingsResponse(cabinet, req));
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour les paramètres du cabinet' })
  async update(@Req() req: Request, @Body() dto: AppSettingsDto) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    if (dto.ai_config !== undefined) {
      throw new BadRequestException(
        'Utilisez les endpoints dedies /api/ai-admin pour modifier la configuration IA',
      );
    }
    const updated = await this.appSettingsService.update(cabinetId, dto);
    return serializeCabinet(settingsResponse(updated, req));
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Réinitialiser les paramètres du cabinet' })
  async reset(@Req() req: Request) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const reset = await this.appSettingsService.reset(cabinetId);
    return serializeCabinet(settingsResponse(reset, req));
  }

  @Post('smtp/test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Envoyer un e-mail de test avec le SMTP du cabinet',
  })
  async testSmtp(@Req() req: Request, @Body() body: { to?: string }) {
    const cabinetId: number = (req.user as any)?.tenantId ?? 1;
    const to = body?.to || (req.user as any)?.email;
    return this.smtpService.sendTest(cabinetId, to);
  }
}
