import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSavingsAccountDto } from './create-savings-account.dto';

export class SavingsAccountResponseDto extends CreateSavingsAccountDto {
  @ApiProperty({ description: 'ID du compte épargne' })
  id: number;

  @ApiProperty({ description: 'Date de création' })
  created_at: Date;

  @ApiProperty({ description: 'Date de mise à jour' })
  updated_at: Date;
}

export class SavingAccountInterestAssignmentResponseDto {
  @ApiProperty({ description: 'ID du compte épargne' })
  savings_account_id: number;

  @ApiProperty({ description: 'ID du taux d’intérêt' })
  interest_saving_account_id: number;

  @ApiProperty({ description: 'Date de début d’application', type: String })
  begin_date: string;

  @ApiPropertyOptional({ description: 'Date de fin d’application', type: String })
  end_date?: string;

  @ApiPropertyOptional({ description: 'Statut de l’affectation', example: 1 })
  status?: number;
}
