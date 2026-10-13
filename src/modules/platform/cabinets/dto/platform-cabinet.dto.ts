import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PlatformCabinetQueryDto {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  /** Statut du cabinet : active | trial | suspended */
  @IsOptional() @IsIn(['active', 'trial', 'suspended'])
  status?: string;

  /** Statut de l'abonnement courant */
  @IsOptional()
  @IsIn(['trial', 'active', 'expired', 'suspended', 'cancelled', 'pending_payment', 'none'])
  subscription_status?: string;

  @IsOptional() @IsIn(['payment_required', 'expired', 'manual'])
  suspension_reason?: string;

  @IsOptional() @IsInt()
  plan_id?: number;

  /** Échéance dans les N prochains jours. */
  @IsOptional() @IsInt() @Min(0) @Max(365)
  expiring_within_days?: number;

  @IsOptional() @IsIn(['name', 'created_at', 'ends_at', 'revenue_total', 'users_count'])
  sort_by?: string;

  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sort_direction?: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class SuspendCabinetDto {
  @ApiProperty({ description: 'Motif (visible dans le journal et par le cabinet)' })
  @IsString() @MinLength(3) @MaxLength(500)
  note: string;
}

export class ExtendSubscriptionDto {
  @ApiPropertyOptional({ description: 'Nombre de jours à ajouter' })
  @IsOptional() @IsInt() @Min(1) @Max(3660)
  days?: number;

  @ApiPropertyOptional({ description: 'Nouvelle date de fin (ISO)' })
  @IsOptional() @IsDateString()
  until?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class GrantFreePeriodDto {
  @ApiProperty({ minimum: 1, maximum: 36 })
  @IsInt() @Min(1) @Max(36)
  months: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ChangeCabinetPlanDto {
  @ApiProperty()
  @IsInt()
  plan_id: number;

  @ApiPropertyOptional({ enum: ['monthly', 'yearly'] })
  @IsOptional() @IsIn(['monthly', 'yearly'])
  cycle?: 'monthly' | 'yearly';

  @ApiProperty({
    enum: ['keep_period', 'new_period'],
    description: 'keep_period : sans facturation ; new_period : nouvelle période facturée',
  })
  @IsIn(['keep_period', 'new_period'])
  mode: 'keep_period' | 'new_period';
}

export class CancelSubscriptionDto {
  @ApiProperty()
  @IsString() @MinLength(3) @MaxLength(255)
  reason: string;

  @ApiProperty({ description: 'true = immédiat (cabinet suspendu) ; false = fin de période' })
  @IsBoolean()
  immediate: boolean;
}

export class EmailCabinetDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(200)
  subject: string;

  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(5000)
  message: string;
}
