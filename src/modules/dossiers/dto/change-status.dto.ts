// src/modules/dossiers/dto/change-status.dto.ts
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';

export class ChangeStatusDto {
  @IsNotEmpty()
  @IsEnum(DossierStatus)
  status: DossierStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  final_decision?: string;
}