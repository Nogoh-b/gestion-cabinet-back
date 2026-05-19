import { Controller, Get, Put, UseGuards, Req, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { UserSettingsService } from '../services/user-settings.service';
import { UserSettingsDto } from '../dto/user-settings.dto';
import { Request } from 'express';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('api/settings/user')
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer les préférences utilisateur' })
  async get(@Req() req: Request) {
    const userId = (req.user as any)?.id;
    return this.userSettingsService.findByUser(userId);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mettre à jour les préférences utilisateur' })
  async update(@Req() req: Request, @Body() dto: UserSettingsDto) {
    const userId = (req.user as any)?.id;
    return this.userSettingsService.update(userId, dto);
  }
}