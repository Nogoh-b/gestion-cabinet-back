import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ClasseCompte, TypeCompte } from '../enums/comptabilite.enums';

export class CreateCompteDto {
  @ApiProperty({ example: '411000' })
  @IsString()
  @Matches(/^[0-9A-Za-z_-]{1,10}$/)
  numero: string;

  @ApiProperty({ example: 'Clients' })
  @IsString()
  @MaxLength(255)
  libelle: string;

  @ApiProperty({ enum: TypeCompte })
  @IsEnum(TypeCompte)
  typeCompte: TypeCompte;

  @ApiProperty({ enum: ClasseCompte })
  @IsInt()
  @Min(1)
  classe: ClasseCompte;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
