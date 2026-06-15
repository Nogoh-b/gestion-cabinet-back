import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsString,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalaryAdvanceStatus } from '../entities/salary-advance.entity';

export class CreateSalaryAdvanceDto {
  @ApiProperty({ example: 5, description: 'ID du collaborateur bénéficiaire' })
  @IsInt()
  @IsNotEmpty()
  employee_id: number;

  @ApiProperty({ example: 150000, description: "Montant de l'avance accordée" })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ example: '2026-06-15', description: "Date d'octroi (défaut: aujourd'hui)" })
  @IsDateString()
  @IsOptional()
  date_granted?: string;

  @ApiPropertyOptional({
    enum: SalaryAdvanceStatus,
    example: SalaryAdvanceStatus.PENDING,
    description: "Statut souhaité. 'paid' déclenche immédiatement l'écriture comptable (425/512).",
  })
  @IsEnum(SalaryAdvanceStatus)
  @IsOptional()
  status?: SalaryAdvanceStatus;

  @ApiPropertyOptional({ example: 'Avance exceptionnelle — rentrée scolaire' })
  @IsString()
  @IsOptional()
  reason?: string;
}
