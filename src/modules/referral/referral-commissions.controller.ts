import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CancelReferralCommissionDto } from './dto/cancel-referral-commission.dto';
import { CreateReferralCommissionDto } from './dto/create-referral-commission.dto';
import { PayReferralCommissionDto } from './dto/pay-referral-commission.dto';
import { ReferralCommissionResponseDto } from './dto/referral-commission-response.dto';
import { ReferralCommissionSearchDto } from './dto/referral-commission-search.dto';
import { UpdateReferralCommissionDto } from './dto/update-referral-commission.dto';
import { ReferralCommissionsService } from './referral-commissions.service';

@Controller('referral-commissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralCommissionsController {
  constructor(
    private readonly service: ReferralCommissionsService,
  ) {}

  private actor(user: any) {
    return {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    };
  }

  private response(value: object | object[]) {
    return plainToInstance(ReferralCommissionResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('create_referral_commission')
  @ApiOperation({ summary: "Calculer une commission d'apporteur" })
  async create(
    @Body() dto: CreateReferralCommissionDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.create(dto, this.actor(user)),
    );
  }

  @Get('/search')
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Rechercher les commissions' })
  @ApiResponse({
    status: 200,
    description: 'Liste des commissions',
    type: [ReferralCommissionResponseDto],
  })
  async search(
    @Query() searchParams?: ReferralCommissionSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    const result = await this.service.searchWithTransformer(
      searchParams as any,
      ReferralCommissionResponseDto,
      paginationParams,
    );
    return {
      ...result,
      data: this.response(result.data),
    };
  }

  @Get('/referral/:referralId')
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: "Commissions d'un apport spécifique" })
  async findByReferral(
    @Param('referralId', ParseIntPipe) referralId: number,
  ) {
    return this.response(
      await this.service.findByReferral(referralId),
    );
  }

  @Get('/referrer/:referrerId')
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: "Commissions d'un apporteur" })
  async findByReferrer(
    @Param('referrerId', ParseIntPipe) referrerId: number,
  ) {
    return this.response(
      await this.service.findByReferrer(referrerId),
    );
  }

  @Get()
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: 'Lister toutes les commissions' })
  async findAll() {
    return this.response(await this.service.findAll());
  }

  @Get(':id')
  @RequirePermissions('view_referral_commissions')
  @ApiOperation({ summary: "Détail d'une commission" })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.response(await this.service.findOne(id));
  }

  @Post(':id/approve')
  @RequirePermissions('validate_referral_commission')
  @ApiOperation({ summary: 'Approuver une commission calculée' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.approve(id, this.actor(user)),
    );
  }

  @Post(':id/pay')
  @RequirePermissions('pay_referral_commission')
  @ApiOperation({ summary: 'Payer une commission approuvée' })
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayReferralCommissionDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.pay(id, dto, this.actor(user)),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('validate_referral_commission')
  @ApiOperation({ summary: 'Annuler une commission non payée' })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReferralCommissionDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.cancel(id, dto, this.actor(user)),
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_referral_commission')
  @ApiOperation({ summary: 'Modifier une commission calculée' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReferralCommissionDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.update(id, dto, this.actor(user)),
    );
  }

  @Delete(':id')
  @RequirePermissions('edit_referral_commission')
  @ApiOperation({ summary: 'Supprimer une commission calculée' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, this.actor(user));
  }
}
