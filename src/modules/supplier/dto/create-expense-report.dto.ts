import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
    IsNumber,
    IsDateString,
    Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseReportDto {
  @ApiProperty({
    example: 5,
    description: 'ID du collaborateur',
  })
  @IsInt()
  @IsNotEmpty()
  employee_id: number;

  @ApiProperty({
    example: 'Déplacement Tribunal Commerce - Dossier #123',
    description: 'Objet de la note de frais',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 245.50,
    description: 'Montant total de la note',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  total_amount: number;

  @ApiProperty({
    example: '2026-04-10',
    description: 'Date de soumission',
  })
  @IsDateString()
  @IsNotEmpty()
  submission_date: Date;

  @ApiPropertyOptional({
    example: 'Note à valider rapidement',
    description: 'Commentaire',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}