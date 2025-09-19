import { IsOptional, IsString, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '../entities/transaction-dispute.entity';

export class UpdateTransactionDisputeDto {
  //////////////////@IsOptional()
  /*@IsEnum(DisputeStatus)
  @ApiPropertyOptional({ enum: DisputeStatus, example: DisputeStatus.OPEN, default: DisputeStatus.OPEN })*/
  status?: DisputeStatus = DisputeStatus.OPEN;

  /*@IsOptional()
  @IsEnum(DisputeSeverity)
  @ApiPropertyOptional({ enum: DisputeSeverity, example: DisputeSeverity.MEDIUM, default: DisputeSeverity.MEDIUM })
  severity?: DisputeSeverity = DisputeSeverity.MEDIUM;*/

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Transaction bloquée pour vérification' })
  description?: string = 'Transaction bloquée pour vérification';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Résolue après confirmation du paiement' })
  resolution_notes?: string = 'Résolue après confirmation du paiement';

  /*@IsOptional()
  @IsInt()
  @ApiPropertyOptional({ example: 101, description: 'ID de l’agent assigné au litige' })*/
  assigned_to_id?: number = 101;
}
