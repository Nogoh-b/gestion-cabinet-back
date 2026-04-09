// src/modules/procedures/dto/update-procedure-type.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';
import { CreateProcedureTypeDto } from './create-procedure.dto';

export class UpdateProcedureTypeDto extends PartialType(CreateProcedureTypeDto) {
  @ApiPropertyOptional({
    description: 'ID du type parent (pour les sous-types)',
    example: 2
  })
  @IsOptional()
  @IsNumber()
  parent_id?: number;
}