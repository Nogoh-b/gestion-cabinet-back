import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiContextConfigService } from './ai-context-config.service';
import { AiAssistantSettingsDto, AiContextConfigDto } from './dto/ai-context-config.dto';

@Controller('api/ai-context-configs')
@UseGuards(JwtAuthGuard)
export class AiContextConfigController {
  constructor(private readonly service: AiContextConfigService) {}
  private tenant(req: any) {
    const tenant = Number(req.user?.tenantId);
    if (!Number.isInteger(tenant) || tenant <= 0) throw new BadRequestException('Cabinet courant invalide');
    return tenant;
  }
  private admin(req: any) {
    if (req.user?.role !== 'admin' && !req.user?.permissions?.includes('SUPER_ADMIN')) throw new ForbiddenException("Réservé à l'administration");
  }
  @Get()
  async list(@Req() req: any) {
    const configs = await this.service.listPublic(this.tenant(req));
    const admin = req.user?.role === 'admin' || req.user?.permissions?.includes('SUPER_ADMIN');
    return configs.map((config) => ({ ...config,
      suggestions: config.suggestions.filter((suggestion) => suggestion.enabled && (!suggestion.permission || admin || req.user?.permissions?.includes(suggestion.permission))),
    }));
  }
  @Get('settings')
  settings(@Req() req: any) { return this.service.getSettings(this.tenant(req)); }
  @Put('settings')
  updateSettings(@Req() req: any, @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: AiAssistantSettingsDto) {
    this.admin(req); return this.service.saveSettings(this.tenant(req), dto);
  }
  @Get('manage')
  manage(@Req() req: any) { this.admin(req); return this.service.list(this.tenant(req)); }
  @Post()
  create(@Req() req: any, @Body() dto: AiContextConfigDto) { this.admin(req); return this.service.save(this.tenant(req), dto); }
  @Put(':id')
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: AiContextConfigDto) {
    this.admin(req); return this.service.save(this.tenant(req), dto, id);
  }
}
