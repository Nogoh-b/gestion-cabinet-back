import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CATEGORIES = ['auth', 'dossier', 'audience', 'billing', 'general'];
const AUDIENCES = ['client', 'collaborator', 'both'];

export class CreateMailTemplateDto {
  @ApiProperty({ example: 'account_opening', description: 'Code unique du template' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Ouverture de compte' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'auth', enum: CATEGORIES })
  @IsString()
  @IsIn(CATEGORIES)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'client', enum: AUDIENCES, description: 'Destinataire visé : client, collaborator ou both' })
  @IsString()
  @IsIn(AUDIENCES)
  @IsOptional()
  audience?: string;

  @ApiPropertyOptional({ example: "E-mail envoyé à la création d'un compte." })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Bienvenue sur {{cabinetName}}' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: '<p>Bonjour {{firstName}}, votre compte est prêt.</p>' })
  @IsString()
  @IsNotEmpty()
  body_html: string;

  @ApiPropertyOptional({ example: '["firstName","cabinetName"]' })
  @IsString()
  @IsOptional()
  variables?: string;

  @ApiPropertyOptional({ example: 'inter', description: 'Clé de police (FONTS front)' })
  @IsString()
  @IsOptional()
  font_family?: string;

  @ApiPropertyOptional({ description: 'Id du bloc en-tête réutilisable' })
  @IsInt()
  @IsOptional()
  header_block_id?: number;

  @ApiPropertyOptional({ description: 'Id du bloc pied de page réutilisable' })
  @IsInt()
  @IsOptional()
  footer_block_id?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
