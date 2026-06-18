import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsObject, IsIn, IsInt } from 'class-validator';

const THEME_NAMES = ['ocean', 'silver', 'yellow', 'forest', 'sunset', 'rose'] as const;
type ThemeName = (typeof THEME_NAMES)[number];

const NUMBERING_STRATEGIES = ['yearly', 'monthly', 'continuous'] as const;
type NumberingStrategy = (typeof NUMBERING_STRATEGIES)[number];

/**
 * DTO de configuration du cabinet (source UNIQUE — table `cabinets`).
 *
 * Remplace l'ancien `app_settings`. Les noms de champs sont désormais
 * canoniques (alignés sur l'entité `Cabinet`).
 */
export class AppSettingsDto {
  // ── Identité ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Cabinet Me Nogoh' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  logo_url?: string | null;

  @ApiPropertyOptional({ example: 'Yaoundé, Cameroun' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+237 6XX XXX XXX' })
  @IsOptional()
  @IsString()
  contact_phone?: string;

  @ApiPropertyOptional({ example: 'contact@cabinet.com' })
  @IsOptional()
  @IsString()
  contact_email?: string;

  @ApiPropertyOptional({ example: 'https://cabinet.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Justice pour tous' })
  @IsOptional()
  @IsString()
  slogan?: string;

  @ApiPropertyOptional({ example: '#1d4ed8' })
  @IsOptional()
  @IsString()
  brand_color?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  email_footer?: string;

  // ── Apparence ───────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: THEME_NAMES, example: 'ocean' })
  @IsOptional()
  @IsIn(THEME_NAMES as unknown as string[])
  theme_name?: ThemeName;

  @ApiPropertyOptional({ example: 'inter' })
  @IsOptional()
  @IsString()
  font_ui?: string;

  @ApiPropertyOptional({ example: 'inter' })
  @IsOptional()
  @IsString()
  font_heading?: string;

  @ApiPropertyOptional({ example: 'jetbrains_mono' })
  @IsOptional()
  @IsString()
  font_mono?: string;

  // ── Informations légales ──────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'RC/YAO/2024/1234' })
  @IsOptional()
  @IsString()
  rccm?: string;

  @ApiPropertyOptional({ example: 'M1234567890P' })
  @IsOptional()
  @IsString()
  nina?: string;

  @ApiPropertyOptional({ example: 'CM21 12345 67890 12345678901 95' })
  @IsOptional()
  @IsString()
  bank_account?: string;

  // ── Configuration régionale ─────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  app_locale?: string;

  @ApiPropertyOptional({ example: 'dd/MM/yyyy' })
  @IsOptional()
  @IsString()
  date_format?: string;

  @ApiPropertyOptional({ example: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string;

  // ── Numérotation ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'FAC-' })
  @IsOptional()
  @IsString()
  invoice_prefix?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  invoice_padding?: number;

  @ApiPropertyOptional({ enum: NUMBERING_STRATEGIES, example: 'yearly' })
  @IsOptional()
  @IsIn(NUMBERING_STRATEGIES as unknown as string[])
  invoice_numbering_strategy?: NumberingStrategy;

  @ApiPropertyOptional({ example: 'DOS-' })
  @IsOptional()
  @IsString()
  dossier_prefix?: string;

  // ── Horaires ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  working_hours_start?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  working_hours_end?: string;

  // ── Notifications & e-mail ──────────────────────────────────────────────
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notification_email?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  notification_sms?: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsObject()
  smtp_config?: object | null;

  // ── Templates ───────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  payslip_template?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  invoice_template?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  dossier_template?: string | null;
}
