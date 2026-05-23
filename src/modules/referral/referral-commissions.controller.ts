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
import { ReferralCommissionsService } from './referral-commissions.service';
import { CreateReferralCommissionDto } from './dto/create-referral-commission.dto';
import { UpdateReferralCommissionDto } from './dto/update-referral-commission.dto';
import { ReferralCommissionSearchDto } from './dto/referral-commission-search.dto';
import { ReferralCommission } from './entities/referral-commission.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

@Controller('referral-commissions')
@ApiBearerAuth()
export class ReferralCommissionsController {
  constructor(private readonly service: ReferralCommissionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create_referral_commission')
  @ApiOperation({ summary: 'Calculer une commission d\'apporteur' })
  create(@Body() dto: CreateReferralCommissionDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Rechercher les commissions' })
  @ApiResponse({ status: 200, description: 'Liste des commissions', type: [ReferralCommission] })
  async search(
    @Query() searchParams?: ReferralCommissionSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      ReferralCommission,
      paginationParams,
    );
  }

  @Get('/referral/:referralId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Commissions d\'un apport spécifique' })
  findByReferral(@Param('referralId') referralId: string) {
    return this.service.findByReferral(+referralId);
  }

  @Get('/referrer/:referrerId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Commissions d\'un apporteur' })
  findByReferrer(@Param('referrerId') referrerId: string) {
    return this.service.findByReferrer(+referrerId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Lister toutes les commissions' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Détail d\'une commission' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('validate_referral_commission')
  @ApiOperation({ summary: 'Approuver une commission' })
  approve(@Param('id') id: string) {
    return this.service.approve(+id);
  }

  @Patch(':id/pay')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pay_referral_commission')
  @ApiOperation({ summary: 'Marquer une commission comme payée' })
  markAsPaid(
    @Param('id') id: string,
    @Body('payment_reference') payment_reference?: string,
  ) {
    return this.service.markAsPaid(+id, payment_reference);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('validate_referral_commission')
  @ApiOperation({ summary: 'Annuler une commission' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_referral_commission')
  @ApiOperation({ summary: 'Modifier une commission' })
  update(@Param('id') id: string, @Body() dto: UpdateReferralCommissionDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_referral_commission')
  @ApiOperation({ summary: 'Supprimer une commission' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}