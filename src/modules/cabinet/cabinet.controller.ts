import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CabinetService } from './cabinet.service';
import { Cabinet } from './entities/cabinet.entity';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Cabinets (SaaS)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cabinets')
export class CabinetController {
  constructor(private readonly service: CabinetService) {}

  /**
   * ⚠️ Routes statiques EN PREMIER — avant les routes paramétriques (:id).
   * NestJS mappe dans l'ordre de définition. Si @Get(':id') était avant,
   * il intercepterait "resolve" et échouerait sur ParseIntPipe.
   */

  /** Résolution publique d'un code → branding complet du cabinet (logo, slogan, nom…)
   *  pour la page de login (avant authentification).
   *  Fusionne les AppSettings (prioritaires) avec les données du cabinet. */
  @Get('resolve/:code')
  @Public()                      // pas d'auth requise
  @ApiOperation({ summary: 'Résoudre un code cabinet → branding complet (nom, logo, slogan, statut)' })
  async resolve(@Param('code') code: string) {
    const merged = await this.service.resolveWithSettings(code);
    if (!merged) return { found: false };
    return {
      data: merged,
      found: true,
    };
  }

  @Get()
  @RequirePermissions('manage_cabinets')
  findAll(): Promise<Cabinet[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('manage_cabinets')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Cabinet> {
    return this.service.findById(id);
  }

  @Post()
  @RequirePermissions('manage_cabinets')
  @ApiOperation({ summary: 'Créer un nouveau cabinet (onboarding)' })
  create(@Body() body: { name: string; plan?: any }): Promise<Cabinet> {
    return this.service.create(body);
  }

  @Patch(':id/activate')
  @RequirePermissions('manage_cabinets')
  activate(@Param('id', ParseIntPipe) id: number): Promise<Cabinet> {
    return this.service.activate(id);
  }

  @Patch(':id/suspend')
  @RequirePermissions('manage_cabinets')
  suspend(@Param('id', ParseIntPipe) id: number): Promise<Cabinet> {
    return this.service.suspend(id);
  }
}
