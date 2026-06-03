import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsEmail, MaxLength } from 'class-validator';
import { CabinetPlan } from '../entities/cabinet.entity';

/**
 * DTO de création d'un cabinet (onboarding).
 *
 * Seuls `name` est obligatoire. Tous les champs de branding/coordonnées
 * sont optionnels et pourront être complétés ultérieurement via
 * PATCH /cabinets/:id/branding.
 */
export class CreateCabinetDto {
  @ApiProperty({ description: 'Nom du cabinet', example: 'Cabinet Dupont & Associes' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Plan d\'abonnement', example: 'free' })
  @IsOptional()
  @IsString()
  plan?: CabinetPlan;

  // ── Branding ───────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Logo en data-URI (data:image/png;base64,…) ou URL',
    example: 'data:image/png;base64,iVBORw0KGgo…',
  })
  @IsOptional()
  @IsString()
  logo_url?: string;

  @ApiPropertyOptional({ description: 'Slogan / devise du cabinet' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slogan?: string;

  @ApiPropertyOptional({ description: 'Couleur principale (hex)', example: '#1d4ed8' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  brand_color?: string;

  // ── Coordonnees ────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'E-mail de contact du cabinet' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contact_email?: string;

  @ApiPropertyOptional({ description: 'Telephone de contact' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_phone?: string;

  @ApiPropertyOptional({ description: 'Adresse postale du cabinet' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Site web du cabinet' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  // ── Informations legales ───────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Numero RCCM' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rccm?: string;

  @ApiPropertyOptional({ description: 'Numero NINA' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nina?: string;

  @ApiPropertyOptional({ description: 'Compte bancaire' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_account?: string;

  // ── Pied de page e-mail ────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Texte de pied de page personnalise pour les e-mails' })
  @IsOptional()
  @IsString()
  email_footer?: string;
}
