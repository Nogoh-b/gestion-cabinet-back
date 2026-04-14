// src/modules/divivion/dto/division-search.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsEnum } from "class-validator";

export enum DivisionStatus {
  ACTIVE = 1,
  INACTIVE = 0,
}

export class DivisionSearchDto {
  @ApiPropertyOptional({ example: "Mfoundi", description: "Nom de la division" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "MF", description: "Code de la division" })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 1, description: "ID de la division" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 1, description: "ID de la région" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  region_id?: number;

  @ApiPropertyOptional({ example: "Centre", description: "Nom de la région" })
  @IsOptional()
  @IsString()
  region_name?: string;

  @ApiPropertyOptional({ example: DivisionStatus.ACTIVE, enum: DivisionStatus, description: "Statut de la division" })
  @IsOptional()
  @IsEnum(DivisionStatus)
  status?: DivisionStatus;

  @ApiPropertyOptional({ example: "500000", description: "Population minimum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_population?: number;

  @ApiPropertyOptional({ example: "2000000", description: "Population maximum" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_population?: number;
}