import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSalaryAdvanceDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @IsNotEmpty()
  employee_id: number;

  @ApiProperty({ example: 150000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsDateString()
  @IsOptional()
  date_granted?: string;

  @ApiPropertyOptional({
    example: 'Avance exceptionnelle pour rentrée scolaire',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}

/** Demande pour soi-même : l'employé est l'utilisateur connecté. */
export class RequestSalaryAdvanceDto extends OmitType(CreateSalaryAdvanceDto, [
  'employee_id',
] as const) {}
