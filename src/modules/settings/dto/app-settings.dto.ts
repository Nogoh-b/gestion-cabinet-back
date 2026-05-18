import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsObject, IsIn } from 'class-validator';

const THEME_NAMES = ['ocean', 'silver', 'yellow', 'forest', 'sunset', 'rose'] as const;
type ThemeName = (typeof THEME_NAMES)[number];

export class AppSettingsDto {
  @ApiProperty({ example: 'Cabinet Me Nogoh' })
  @IsOptional()
  @IsString()
  cabinet_name?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  cabinet_logo?: string | null;

  // 🎨 Thème nommé — palette pré-configurée (light mode uniquement)
  @ApiPropertyOptional({ enum: THEME_NAMES, example: 'ocean' })
  @IsOptional()
  @IsIn(THEME_NAMES as unknown as string[])
  theme_name?: ThemeName;

  @ApiProperty({ example: 'Yaoundé, Cameroun' })
  @IsOptional()
  @IsString()
  cabinet_address?: string;

  @ApiProperty({ example: '+237 6XX XXX XXX' })
  @IsOptional()
  @IsString()
  cabinet_phone?: string;

  @ApiProperty({ example: 'contact@cabinet.com' })
  @IsOptional()
  @IsString()
  cabinet_email?: string;

  @ApiProperty({ example: '' })
  @IsOptional()
  @IsString()
  cabinet_website?: string;

  @ApiProperty({ example: 'Justice pour tous' })
  @IsOptional()
  @IsString()
  cabinet_slogan?: string;

  @ApiProperty({ example: 'RC/YAO/2024/1234' })
  @IsOptional()
  @IsString()
  cabinet_rccm?: string;

  @ApiProperty({ example: 'M1234567890P' })
  @IsOptional()
  @IsString()
  cabinet_nina?: string;

  @ApiProperty({ example: 'CM21 12345 67890 12345678901 95' })
  @IsOptional()
  @IsString()
  cabinet_bank_account?: string;

  @ApiProperty({ example: 'fr' })
  @IsOptional()
  @IsString()
  app_locale?: string;

  @ApiProperty({ example: 'dd/MM/yyyy' })
  @IsOptional()
  @IsString()
  date_format?: string;

  @ApiProperty({ example: 'XAF' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 'FAC-' })
  @IsOptional()
  @IsString()
  invoice_prefix?: string;

  @ApiProperty({ example: 'DOS-' })
  @IsOptional()
  @IsString()
  dossier_prefix?: string;

  @ApiProperty({ example: '08:00' })
  @IsOptional()
  @IsString()
  working_hours_start?: string;

  @ApiProperty({ example: '17:00' })
  @IsOptional()
  @IsString()
  working_hours_end?: string;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  notification_email?: boolean;

  @ApiProperty({ example: false })
  @IsOptional()
  @IsBoolean()
  notification_sms?: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsObject()
  smtp_config?: object | null;

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