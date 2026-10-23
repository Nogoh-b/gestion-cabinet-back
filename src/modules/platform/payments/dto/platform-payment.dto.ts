import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PlatformPaymentQueryDto {
  /** Nature : paiements d'abonnement (défaut) ou achats de crédits IA. */
  @IsOptional() @IsIn(['subscription', 'ai_credits'])
  kind?: string;

  @IsOptional() @IsIn(['pending', 'awaiting_validation', 'paid', 'failed', 'refunded', 'cancelled', 'due'])
  status?: string;

  @IsOptional() @IsString() @MaxLength(40)
  method?: string;

  @IsOptional() @IsString() @MaxLength(30)
  provider?: string;

  @IsOptional() @IsInt()
  cabinet_id?: number;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  /** Filtre de dates sur : paid_at (défaut), created_at ou refunded_at. */
  @IsOptional() @IsIn(['paid_at', 'created_at', 'refunded_at', 'due_date'])
  date_field?: string;

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(200)
  limit?: number;
}

export class ValidatePaymentDto {
  @ApiPropertyOptional({ description: 'Référence constatée (relevé, SMS…)' })
  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class RejectPaymentDto {
  @ApiProperty()
  @IsString() @MinLength(3) @MaxLength(200)
  reason: string;
}

export class RefundPaymentDto {
  @ApiPropertyOptional({ description: 'Montant (défaut : reste remboursable)' })
  @IsOptional() @IsNumber() @Min(0.01)
  amount?: number;

  @ApiProperty()
  @IsString() @MinLength(3) @MaxLength(255)
  reason: string;

  @ApiPropertyOptional({ description: 'Rembourser via l’API de la passerelle (Stripe)' })
  @IsOptional() @IsBoolean()
  via_provider?: boolean;
}

export class WaivePaymentDto {
  @ApiProperty()
  @IsString() @MinLength(3) @MaxLength(255)
  reason: string;
}

export class RecordPaymentDto {
  @ApiPropertyOptional({ description: 'Échéance précise (défaut : échéance due)' })
  @IsOptional() @IsInt()
  payment_id?: number;

  @ApiProperty({ description: 'Code du moyen (bank_transfer, cash…) ou `other`' })
  @IsString() @MaxLength(40)
  method_code: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ description: 'Date d’encaissement (défaut : maintenant)' })
  @IsOptional() @IsDateString()
  paid_at?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class PaymentMethodDto {
  @IsOptional() @IsString() @MaxLength(40)
  code?: string;

  @IsOptional() @IsString() @MaxLength(100)
  label?: string;

  @IsOptional() @IsIn(['gateway', 'manual'])
  kind?: 'gateway' | 'manual';

  @IsOptional() @IsIn(['cinetpay', 'notchpay', 'stripe'])
  provider?: 'cinetpay' | 'notchpay' | 'stripe';

  @IsOptional() @IsIn(['sandbox', 'live'])
  mode?: 'sandbox' | 'live';

  @IsOptional() @IsObject()
  public_config?: Record<string, any>;

  @IsOptional() @IsArray()
  currencies?: string[];

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  fee_percent?: number;

  @IsOptional() @IsNumber() @Min(0)
  fee_fixed?: number;

  @IsOptional() @IsNumber() @Min(0)
  min_amount?: number;

  @IsOptional() @IsInt()
  sort_order?: number;

  /** Secrets en clair (jamais renvoyés) ; vide/masqué = inchangé ; null = effacé. */
  @IsOptional() @IsObject()
  secrets?: Record<string, string | null>;
}
