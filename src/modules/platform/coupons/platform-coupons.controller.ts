import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponsService } from 'src/modules/subscriptions/coupons/coupons.service';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';

export class CouponDto {
  @IsOptional() @IsString() @MaxLength(40)
  code?: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string | null;

  @IsOptional() @IsIn(['percent', 'fixed', 'free_months'])
  type?: 'percent' | 'fixed' | 'free_months';

  @IsOptional() @IsNumber() @Min(0)
  value?: number;

  @IsOptional() @IsArray()
  plan_ids?: number[] | null;

  @IsOptional() @IsIn(['any', 'monthly', 'yearly'])
  cycle?: 'any' | 'monthly' | 'yearly';

  @IsOptional() @IsInt() @Min(1)
  duration_cycles?: number | null;

  @IsOptional() @IsInt() @Min(1)
  max_redemptions?: number | null;

  @IsOptional() @IsInt() @Min(1)
  max_per_cabinet?: number;

  @IsOptional() @IsString()
  valid_from?: string | null;

  @IsOptional() @IsString()
  valid_until?: string | null;
}

const COUPON = { targetType: 'coupon' };

@ApiTags('Plateforme — Codes promo')
@Controller('platform/coupons')
@PlatformRoute()
export class PlatformCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'Codes promo et statistiques d’utilisation' })
  list() {
    return this.coupons.list();
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: 'Utilisations d’un code promo' })
  redemptions(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.redemptionsOf(id);
  }

  @Post()
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'coupon.create', ...COUPON })
  async create(@Body() dto: CouponDto, @CurrentPlatformAdmin() admin: PlatformPrincipal) {
    const coupon = await this.coupons.create(dto, admin.id);
    PlatformAuditContext.set({ targetId: coupon.id, after: coupon as any, summary: `Code ${coupon.code}` });
    return coupon;
  }

  @Patch(':id')
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'coupon.update', ...COUPON })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: CouponDto) {
    const { before, after } = await this.coupons.update(id, dto);
    PlatformAuditContext.set({ before: before as any, after: after as any, summary: `Code ${after.code}` });
    return after;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'coupon.activate', ...COUPON })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.setActive(id, true);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'coupon.deactivate', ...COUPON })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.setActive(id, false);
  }
}
