import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OnboardingDto {
  @ApiProperty({ example: 'Cabinet Dupont & Associés' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cabinet_name: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name: string;

  @ApiProperty({ example: 'jean.dupont@cabinet.fr' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: ['path', 'subdomain'], default: 'path' })
  @IsOptional()
  @IsString()
  routing_mode?: 'path' | 'subdomain';

  /**
   * Code du plan choisi lors de l'inscription.
   * Si absent, le plan "free" est appliqué par défaut.
   */
  @ApiProperty({ example: 'free', default: 'free', required: false })
  @IsOptional()
  @IsString()
  plan_code?: string;

  /**
   * Cycle de facturation choisi : mensuel ou annuel. Défaut : mensuel.
   */
  @ApiProperty({ enum: ['monthly', 'yearly'], default: 'monthly', required: false })
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billing_cycle?: 'monthly' | 'yearly';
}
