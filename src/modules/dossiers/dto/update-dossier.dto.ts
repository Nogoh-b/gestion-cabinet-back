// src/modules/dossiers/dto/update-dossier.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDossierDto } from './create-dossier.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateDossierDto extends PartialType(CreateDossierDto) {
  @IsOptional()
  @IsString()
  final_decision?: string;

}
