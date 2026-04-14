// src/modules/country/dto/country-search.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber } from "class-validator";

export class CountrySearchDto {
  @ApiPropertyOptional({ example: "Cameroun", description: "Nom du pays" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "CMR", description: "Code du pays" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 1, description: "ID du pays" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;
}