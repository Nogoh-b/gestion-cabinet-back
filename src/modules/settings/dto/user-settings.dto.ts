import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UserSettingsDto {
  @ApiProperty({ example: 'system' })
  @IsOptional()
  @IsString()
  user_theme?: string;

  @ApiProperty({ example: 'md' })
  @IsOptional()
  @IsString()
  user_font_size?: string;

  @ApiProperty({ example: 'fr' })
  @IsOptional()
  @IsString()
  user_language?: string;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  user_notifications_enabled?: boolean;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  user_email_notifications?: boolean;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  user_in_app_notifications?: boolean;

  @ApiProperty({ example: false })
  @IsOptional()
  @IsBoolean()
  user_sidebar_collapsed?: boolean;

  @ApiProperty({ example: 10 })
  @IsOptional()
  @IsNumber()
  user_items_per_page?: number;

  @ApiProperty({ example: '/dashboard' })
  @IsOptional()
  @IsString()
  user_default_dashboard?: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  user_signature?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  user_avatar?: string | null;

  @ApiProperty({ example: '' })
  @IsOptional()
  @IsString()
  user_phone?: string;
}