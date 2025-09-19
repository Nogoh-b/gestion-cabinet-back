import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAccountOverdraftDto {
  @ApiProperty({ example: 1, description: 'ID du compte lié' })
  @IsNotEmpty()
  @IsNumber()
  account_id: number;

  @ApiProperty({ example: -100000, description: 'Plafond de découvert autorisé (valeur négative ou 0)' })
  @IsNotEmpty()
  @IsNumber()
  overdraft_limit: number;

  @ApiProperty({ example: 'Autorisation spéciale', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
