import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { DossierReferralsService } from './dossier-referrals.service';
import { CreateDossierReferralDto } from './dto/create-dossier-referral.dto';
import { DossierReferral } from './entities/dossier-referral.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { DossierReferralSearchDto } from './dto/dossier-referral-search.dto';
import { UpdateDossierReferralDto } from './dto/update-dossier-referral.dto';

@Controller('dossier-referrals')
@ApiBearerAuth()
export class DossierReferralsController {
  constructor(private readonly service: DossierReferralsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create_dossier_referral')
  @ApiOperation({ summary: 'Assigner un apporteur à un dossier' })
  create(@Body() dto: CreateDossierReferralDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_dossier_referrals')
  @ApiOperation({ summary: 'Rechercher les apports de dossiers' })
  @ApiResponse({ status: 200, description: 'Liste des apports', type: [DossierReferral] })
  async search(
    @Query() searchParams?: DossierReferralSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {

    return this.service.searchWithTransformer(
      searchParams as any,
      DossierReferral,
      paginationParams,
    );
  }

  @Get('/dossier/:dossierId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_dossier_referrals')
  @ApiOperation({ summary: 'Apporteur d\'un dossier spécifique' })
  findByDossier(@Param('dossierId') dossierId: string) {
    return this.service.findByDossier(+dossierId);
  }

  @Get('/referrer/:referrerId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_dossier_referrals')
  @ApiOperation({ summary: 'Dossiers apportés par un apporteur' })
  findByReferrer(@Param('referrerId') referrerId: string) {
    return this.service.findByReferrer(+referrerId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_dossier_referrals')
  @ApiOperation({ summary: 'Lister tous les apports de dossiers' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_dossier_referrals')
  @ApiOperation({ summary: 'Détail d\'un apport de dossier' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_dossier_referral')
  @ApiOperation({ summary: 'Modifier un apport de dossier' })
  update(@Param('id') id: string, @Body() dto: UpdateDossierReferralDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_dossier_referral')
  @ApiOperation({ summary: 'Supprimer un apport de dossier' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}