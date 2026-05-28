import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ example: 'Plan Pro', description: 'Nom du plan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'PLAN_PRO', description: 'Code unique du plan' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'Plan pour cabinets de taille moyenne' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 20, description: 'Nombre max d\'employés' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  max_employees?: number;

  @ApiPropertyOptional({ example: 50, description: 'Stockage max en Go' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  max_storage_gb?: number;

  @ApiPropertyOptional({ example: 500, description: 'Nombre max de dossiers' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  max_dossiers?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Nombre max de clients' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  max_clients?: number;

  @ApiPropertyOptional({ example: true, description: 'IA activée' })
  @IsBoolean()
  @IsOptional()
  ai_enabled?: boolean;

  @ApiPropertyOptional({ example: 500, description: 'Requêtes IA par mois' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  ai_requests_per_month?: number;

  @ApiProperty({ example: 49.0, description: 'Prix mensuel en €' })
  @IsNumber()
  @Min(0)
  price_monthly: number;

  @ApiPropertyOptional({ example: 490.0, description: 'Prix annuel en €' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price_yearly?: number;

  @ApiPropertyOptional({ example: 'Facturation, Dossiers, IA' })
  @IsString()
  @IsOptional()
  features?: string;

  @ApiPropertyOptional({ example: true, description: 'Plan disponible à la souscription' })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
