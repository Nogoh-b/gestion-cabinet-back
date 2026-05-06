import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '../entities/expense-line.entity';

export class CreateExpenseLineDto {
  @ApiProperty({
    example: 1,
    description: 'ID de la note de frais parente',
  })
  @IsInt()
  @IsNotEmpty()
  expense_report_id: number;

  @ApiProperty({
    example: '2026-04-08',
    description: 'Date de la dépense',
  })
  @IsDateString()
  @IsNotEmpty()
  expense_date: Date;

  @ApiProperty({
    example: 'Train Paris-Lyon A/R',
    description: 'Description de la dépense',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    enum: ExpenseCategory,
    example: ExpenseCategory.TRANSPORT,
    description: 'Catégorie de dépense',
  })
  @IsEnum(ExpenseCategory)
  @IsNotEmpty()
  category: ExpenseCategory;

  @ApiProperty({
    example: 120.0,
    description: 'Montant HT',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount_ht: number;

  @ApiProperty({
    example: 20.0,
    description: 'Taux TVA (%)',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  tax_rate: number;

  @ApiProperty({
    example: 144.0,
    description: 'Montant TTC',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount_ttc: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Refacturable au client',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_rebillable?: boolean;

  @ApiPropertyOptional({
    example: 15,
    description: 'ID du dossier associé (si refacturable)',
  })
  @IsInt()
  @IsOptional()
  dossier_id?: number;

  @ApiPropertyOptional({
    example: 'https://storage.cabinet.fr/justificatifs/ticket-train.pdf',
    description: 'Lien vers le justificatif',
  })
  @IsString()
  @IsOptional()
  attachment_url?: string;
}