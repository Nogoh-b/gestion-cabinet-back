import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CabinetService } from './cabinet.service';
import { Cabinet, serializeCabinet } from './entities/cabinet.entity';
import { CreateCabinetDto } from './dto/create-cabinet.dto';
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
   *  La configuration vit directement dans la table `cabinets`. */
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
  async findAll() {
    const cabinets = await this.service.findAll();
    return cabinets.map(serializeCabinet);
  }

  @Get(':id')
  @RequirePermissions('manage_cabinets')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return serializeCabinet(await this.service.findById(id));
  }

  @Post()
  @RequirePermissions('manage_cabinets')
  @ApiOperation({ summary: 'Créer un nouveau cabinet (onboarding) avec branding, coordonnees et seed des donnees de reference' })
  async create(@Body() body: CreateCabinetDto) {
    const cabinet = await this.service.create(body);
    return serializeCabinet(cabinet);
  }

  @Patch(':id/branding')
  @RequirePermissions('manage_cabinets')
  @ApiOperation({ summary: 'Mettre à jour le branding du cabinet (logo, couleur, coordonnées e-mail)' })
  updateBranding(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      logo_url?: string;
      brand_color?: string;
      contact_email?: string;
      contact_phone?: string;
      address?: string;
      website?: string;
      email_footer?: string;
      name?: string;
    },
  ) {
    return this.service.updateBranding(id, body);
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
