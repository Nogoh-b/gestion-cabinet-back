import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber } from "class-validator";

export class RegionSearchDto {
  @ApiPropertyOptional({ example: "Centre", description: "Nom de la région" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "CE", description: "Code de la région" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 1, description: "ID de la région" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 1, description: "ID du pays" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  country_id?: number;

  @ApiPropertyOptional({ example: "Cameroun", description: "Nom du pays" })
  @IsOptional()
  @IsString()
  country_name?: string;
}