import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { BillingCycle } from '../entities/subscription.entity';

export class ChangeSubscriptionDto {
  @ApiProperty({
    required: false,
    description: 'Nouveau plan (id). Conserve le plan actuel si absent.',
  })
  @IsOptional()
  @IsInt()
  plan_id?: number;

  @ApiProperty({ enum: ['monthly', 'yearly'], required: false })
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  cycle?: BillingCycle;

  @ApiProperty({ required: false, description: 'Code promo appliqué à la nouvelle période' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  coupon_code?: string;
}
