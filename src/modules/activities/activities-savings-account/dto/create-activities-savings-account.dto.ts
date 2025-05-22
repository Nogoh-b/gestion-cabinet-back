// DTO de création - src/core-banking/dto/create-activities-savings-account.dto.ts
// Données attendues pour créer une nouvelle activité
import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateActivitiesSavingsAccountDto {
  @ApiPropertyOptional({ example: 'création', description: 'Type d’activité' })
  @IsOptional()
  @IsString()
  activity_type?: string;

  @ApiProperty({ example: 1, description: 'ID du compte d’épargne' })
  @IsInt()
  savings_account_id: number;

  @ApiProperty({ example: 5, description: 'ID de l’utilisateur' })
  @IsInt()
  user_id: number;
}