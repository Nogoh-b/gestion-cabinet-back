import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayslipLineType } from '../entities/payslip-line.entity';

export class CreatePayslipLineDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la fiche de paie parente',
  })
  @IsInt()
  @IsNotEmpty()
  payslip_id: number;

  @ApiProperty({
    enum: PayslipLineType,
    example: PayslipLineType.BASE_SALARY,
    description: 'Type de ligne',
  })
  @IsEnum(PayslipLineType)
  @IsNotEmpty()
  line_type: PayslipLineType;

  @ApiProperty({
    example: 'Salaire de base - Mars 2026',
    description: 'Libellé de la ligne',
  })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({
    example: 4500.0,
    description: 'Montant',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Imposable',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  is_taxable?: boolean;

  @ApiPropertyOptional({
    example: 15,
    description: 'ID du dossier source (pour commissions internes)',
  })
  @IsInt()
  @IsOptional()
  dossier_id?: number;

  @ApiPropertyOptional({
    example: '10% des honoraires HT du dossier DOS-2026-015',
    description: 'Détail du calcul',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
