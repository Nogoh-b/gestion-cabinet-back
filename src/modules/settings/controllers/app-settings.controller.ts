import { Controller, Get, Put, Post, UseGuards, Req, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AppSettingsService } from '../services/app-settings.service';
import { AppSettingsDto } from '../dto/app-settings.dto';
import { Request } from 'express';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/settings/app')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer les paramètres du cabinet' })
  async get(@Req() req: Request) {
    const cabinetId = (req.user as any)?.branch?.id;
    return this.appSettingsService.findByCabinet(cabinetId);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour les paramètres du cabinet' })
  async update(@Req() req: Request, @Body() dto: AppSettingsDto) {
    const cabinetId = (req.user as any)?.branch?.id;
    return this.appSettingsService.update(cabinetId, dto);
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Réinitialiser les paramètres du cabinet' })
  async reset(@Req() req: Request) {
    const cabinetId = (req.user as any)?.branch?.id;
    return this.appSettingsService.reset(cabinetId);
  }
}