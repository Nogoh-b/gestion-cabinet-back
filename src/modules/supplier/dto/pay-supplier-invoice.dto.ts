import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/supplier-invoice.entity';

export class PaySupplierInvoiceDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Date effective ; la date courante est utilisée par défaut',
  })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiProperty({
    description: 'Référence bancaire ou justificatif du paiement',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  paymentReference: string;
}
