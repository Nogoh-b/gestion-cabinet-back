// src/modules/location_city/dto/location-city-search.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsArray } from "class-validator";

export class LocationCitySearchDto {
  @ApiPropertyOptional({ example: "Mvog-Mbi", description: "Nom de la ville/quartier" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "MVG01", description: "Code de la ville" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 1, description: "ID de la ville" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 1, description: "ID du district" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  districts_id?: number;

  @ApiPropertyOptional({ example: "Yaoundé 1er", description: "Nom du district" })
  @IsOptional()
  @IsString()
  district_name?: string;

  @ApiPropertyOptional({ example: "Mfoundi", description: "Nom de la division" })
  @IsOptional()
  @IsString()
  division_name?: string;

  @ApiPropertyOptional({ example: "Centre", description: "Nom de la région" })
  @IsOptional()
  @IsString()
  region_name?: string;

  @ApiPropertyOptional({ example: "Cameroun", description: "Nom du pays" })
  @IsOptional()
  @IsString()
  country_name?: string;

  @ApiPropertyOptional({ example: "Douala", description: "Recherche par adresse complète" })
  @IsOptional()
  @IsString()
  full_address?: string;

  @ApiPropertyOptional({ example: "1000", description: "Population minimum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_population?: number;

  @ApiPropertyOptional({ example: "100000", description: "Population maximum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_population?: number;

  @ApiPropertyOptional({ example: [1, 2, 3], description: "IDs des districts", type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  district_ids?: number[];
}