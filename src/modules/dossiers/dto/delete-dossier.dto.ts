import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional } from 'class-validator';
import {
  DOSSIER_DELETION_CATEGORIES,
  DossierDeletionCategory,
} from '../deletion/dossier-deletion.service';

export class DeleteDossierDto {
  @ApiPropertyOptional({
    enum: DOSSIER_DELETION_CATEGORIES,
    isArray: true,
    description: 'Éléments liés à supprimer avec le dossier',
  })
  @IsOptional()
  @IsArray()
  @IsIn(DOSSIER_DELETION_CATEGORIES, {
    each: true,
    message: 'Type d’élément lié inconnu.',
  })
  include?: DossierDeletionCategory[];
}
