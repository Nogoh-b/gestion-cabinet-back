import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  COLOR_MODES,
  FONT_KEY_PATTERN,
  FONT_SIZES,
  SIDEBAR_STYLES,
  THEME_NAMES,
} from '../appearance.constants';

export class UserSettingsDto {
  @ApiProperty({ enum: COLOR_MODES, example: 'system' })
  @IsOptional()
  @IsIn(COLOR_MODES as unknown as string[])
  user_theme?: string;

  @ApiProperty({ enum: FONT_SIZES, example: 'lg' })
  @IsOptional()
  @IsIn(FONT_SIZES as unknown as string[])
  user_font_size?: string;

  @ApiPropertyOptional({ enum: THEME_NAMES, example: 'midnight' })
  @IsOptional()
  @IsIn(THEME_NAMES as unknown as string[])
  user_theme_name?: string;

  @ApiPropertyOptional({ example: 'outfit' })
  @IsOptional()
  @Matches(FONT_KEY_PATTERN)
  user_font_ui?: string;

  @ApiPropertyOptional({ example: 'outfit' })
  @IsOptional()
  @Matches(FONT_KEY_PATTERN)
  user_font_heading?: string;

  @ApiPropertyOptional({ example: 'jetbrains_mono' })
  @IsOptional()
  @Matches(FONT_KEY_PATTERN)
  user_font_mono?: string;

  @ApiPropertyOptional({ enum: SIDEBAR_STYLES, example: 'tinted' })
  @IsOptional()
  @IsIn(SIDEBAR_STYLES as unknown as string[])
  user_sidebar_style?: string;

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
