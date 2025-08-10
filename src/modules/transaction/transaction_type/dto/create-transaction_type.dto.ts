// DTO de création - src/core-banking/dto/create-transaction-type.dto.ts
// Données attendues pour créer un nouveau type de transaction
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransactionTypeDto {
  @ApiProperty({ example: 'DEPOT', description: 'Code unique du type de transaction' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Dépôt en espèce', description: 'Nom du type de transaction' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Versement de billets en caisse', description: 'Description détaillée' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 1, description: '1 = Crédit (entrée), 0 = Débit (sortie)' })
  @IsNumber()
  is_credit: number;

  @ApiPropertyOptional({ example: 0.50, description: 'Pourcentage des frais appliqués' })
  @IsOptional()
  @IsNumber()
  fee_percentage?: number;
}