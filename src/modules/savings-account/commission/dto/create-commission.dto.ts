
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsString,
    IsNumber, IsEnum
} from 'class-validator';
export class CreateCommissionDto {
  @ApiProperty({ description: 'Description de la commission' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Type de valeur', enum: ['Fixé', 'Variable'] })
  @IsEnum(['Fixé', 'Variable' as const])
  type_valeur: 'Fixé' | 'Variable';

  @ApiPropertyOptional({ description: 'Montant de la commission', example: 0 })
  @IsOptional()
  @IsNumber()
  montant?: number;
}
