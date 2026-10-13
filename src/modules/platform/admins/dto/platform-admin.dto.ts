import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PLATFORM_ROLES, PlatformRole } from '../../entities/platform-admin.entity';

export class InvitePlatformAdminDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name: string;

  @ApiProperty({ enum: PLATFORM_ROLES })
  @IsIn(PLATFORM_ROLES as unknown as string[])
  role: PlatformRole;
}

export class UpdatePlatformAdminDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  full_name?: string;

  @ApiPropertyOptional({ enum: PLATFORM_ROLES })
  @IsOptional()
  @IsIn(PLATFORM_ROLES as unknown as string[])
  role?: PlatformRole;

  @ApiPropertyOptional({ enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
