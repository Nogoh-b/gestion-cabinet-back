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

  @ApiProperty({ example: 'PLAN_PRO', description: 'Code unique. Généré automatiquement si non fourni.', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Plan pour cabinets de taille moyenne' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 20, description: "Nombre max d'employés (-1 = illimité)" })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_employees?: number;

  @ApiPropertyOptional({ example: 50, description: 'Stockage max en Go (-1 = illimité)' })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_storage_gb?: number;

  @ApiPropertyOptional({ example: 500, description: 'Nombre max de dossiers (-1 = illimité)' })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_dossiers?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Nombre max de clients' })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_clients?: number;

  @ApiPropertyOptional({ example: 3, description: "Nombre max d'agences (-1 = illimité)" })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_branches?: number;

  @ApiPropertyOptional({ example: -1, description: "Nombre max d'audiences (-1 = illimité)" })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_audiences?: number;

  // ── Modules ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: true, description: 'Module Paie activé' })
  @IsBoolean()
  @IsOptional()
  payroll_enabled?: boolean;

  @ApiPropertyOptional({ example: 50, description: 'Bulletins de paie max / mois (-1 = illimité)' })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_payslips_per_month?: number;

  @ApiPropertyOptional({ example: true, description: 'Module Dépenses activé' })
  @IsBoolean()
  @IsOptional()
  expenses_enabled?: boolean;

  @ApiPropertyOptional({ example: 500, description: 'Dépenses max / mois (-1 = illimité)' })
  @IsNumber()
  @Min(-1)
  @IsOptional()
  max_expenses_per_month?: number;

  @ApiPropertyOptional({ example: true, description: 'Module Documents activé' })
  @IsBoolean()
  @IsOptional()
  documents_enabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Module Facturation activé' })
  @IsBoolean()
  @IsOptional()
  invoicing_enabled?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Rapports avancés activés' })
  @IsBoolean()
  @IsOptional()
  reporting_enabled?: boolean;

  @ApiPropertyOptional({ example: 'priority', description: 'Niveau de support (community/email/priority/dedicated)' })
  @IsString()
  @IsOptional()
  support_level?: string;

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

  @ApiPropertyOptional({ example: true, description: 'Essai activé pour ce plan' })
  @IsBoolean()
  @IsOptional()
  trial_enabled?: boolean;

  @ApiPropertyOptional({ example: 14, description: 'Durée de l\'essai en jours (si trial_enabled)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  trial_days?: number;

  @ApiPropertyOptional({ example: 12, description: 'Mois d\'engagement après l\'essai (0 = aucun)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  min_commitment_months?: number;
}
