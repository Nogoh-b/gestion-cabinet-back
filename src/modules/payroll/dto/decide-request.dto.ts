import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Refus d'une demande : la raison est exigée et communiquée au collaborateur. */
export class RejectRequestDto {
  @ApiProperty({
    example: 'Période incompatible avec une audience déjà planifiée.',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

/** Annulation d'une demande : la raison est exigée (traçabilité RH). */
export class CancelRequestDto {
  @ApiProperty({ example: 'Annulée à la demande du collaborateur.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

/**
 * Annulation d'une avance : la raison reste facultative pour ne pas casser
 * les appels historiques de la page Paie, qui annulent sans corps de requête.
 */
export class CancelAdvanceDto {
  @ApiPropertyOptional({ example: 'Demande retirée par le collaborateur.' })
  @IsString()
  @IsOptional()
  reason?: string;
}

/** Validation d'une demande : un commentaire facultatif peut être joint. */
export class ApproveRequestDto {
  @ApiPropertyOptional({
    example: 'Accord sous réserve de la passation de dossiers.',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
