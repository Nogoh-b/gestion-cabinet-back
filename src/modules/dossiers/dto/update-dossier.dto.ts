// src/modules/dossiers/dto/update-dossier.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDossierDto } from './create-dossier.dto';
import { IsEnum, IsOptional, IsDateString, IsBoolean, IsString } from 'class-validator';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';

export class UpdateDossierDto extends PartialType(CreateDossierDto) {
  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;

  @IsOptional()
  @IsDateString()
  closing_date?: string;

  @IsOptional()
  @IsString()
  final_decision?: string;

  @IsOptional()
  @IsBoolean()
  appeal_possibility?: boolean;

  @IsOptional()
  @IsDateString()
  appeal_deadline?: string;
}