import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsDateString,
  IsObject,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export class AttachmentDto {
  @ApiProperty({
    description: 'Nom du fichier',
    example: 'facture.pdf',
  })
  @IsString()
  filename: string;

  @ApiPropertyOptional({
    description: 'Contenu du fichier en base64',
    example: 'JVBERi0xLjQKJ...',
  })
  @IsOptional()
  @IsString()
  content?: string; // base64

  @ApiPropertyOptional({
    description: 'Chemin du fichier sur le serveur',
    example: '/uploads/facture.pdf',
  })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({
    description: 'Type MIME du fichier',
    example: 'application/pdf',
  })
  @IsOptional()
  @IsString()
  contentType?: string;
}

export class CreateMailDto {
  @ApiPropertyOptional({
    description: 'Nom du template email',
    example: 'welcome-template',
  })
  @IsOptional()
  @IsString()
  templateName?: string;

  @ApiPropertyOptional({
    description: 'Contexte pour le template',
    example: { username: 'Lionel' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiProperty({
    description: 'Destinataires principaux',
    example: ['user@example.com'],
    type: [String],
  })
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  to: string[];

  @ApiPropertyOptional({
    description: 'Destinataires en copie',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({
    description: 'Destinataires en copie cachée',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiPropertyOptional({
    description: 'Sujet du mail',
    example: 'Bienvenue sur notre plateforme',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Contenu HTML',
  })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({
    description: 'Contenu texte brut',
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    description: 'Pièces jointes',
    type: [AttachmentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @ApiPropertyOptional({
    description: "Date d'envoi programmée (ISO)",
    example: '2026-03-05T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Métadonnées libres',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}



