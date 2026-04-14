// src/modules/district/dto/district-search.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsBoolean } from "class-validator";

export class DistrictSearchDto {
  @ApiPropertyOptional({ example: "Yaoundé 1er", description: "Nom du district" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "YDE1", description: "Code du district" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 1, description: "ID du district" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 1, description: "ID de la division" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  division_id?: number;

  @ApiPropertyOptional({ example: "Mfoundi", description: "Nom de la division" })
  @IsOptional()
  @IsString()
  division_name?: string;

  @ApiPropertyOptional({ example: "Centre", description: "Nom de la région" })
  @IsOptional()
  @IsString()
  region_name?: string;

  @ApiPropertyOptional({ example: true, description: "Afficher uniquement les districts avec villes" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  has_cities?: boolean;

  @ApiPropertyOptional({ example: "10000", description: "Population minimum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_population?: number;

  @ApiPropertyOptional({ example: "500000", description: "Population maximum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_population?: number;
}