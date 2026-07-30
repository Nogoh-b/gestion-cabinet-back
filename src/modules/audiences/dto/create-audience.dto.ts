// src/modules/audiences/dto/create-audience.dto.ts
import { IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';





export class CreateAudienceDto {
  @ApiProperty({
    example: 12,
    description: "Identifiant du dossier lié à cette audience",
  })
  @IsInt()
  @IsNotEmpty()
  dossier_id: number;

  @ApiProperty({
    example: '2025-10-20T09:00:00Z',
    description: "Date prévue pour l'audience",
  })
  @IsDateString()
  @IsOptional()
  audience_date?: Date;

  @ApiProperty({
    example: '09:00:00',
    description: "Heure prévue pour l'audience",
  })
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  @IsOptional()
  audience_time?: string;

  @ApiPropertyOptional({
    example: '2026-08-03T08:00:00Z',
    description: "Instant canonique UTC du début de l'audience",
  })
  @IsDateString()
  @IsOptional()
  starts_at_utc?: string;

  @ApiPropertyOptional({
    example: 'Africa/Ndjamena',
    description: "Fuseau horaire IANA d'affichage et de calcul",
    default: 'Africa/Ndjamena',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    description:
      'Motif obligatoire lorsque la création intervient moins de 48 heures avant le début',
  })
  @IsString()
  @IsOptional()
  late_scheduling_reason?: string;

  @ApiProperty({
    example: 60,
    description: "Durée prévue pour l'audience en minutes",
  })
  @IsInt()
  @Min(1)
  duration_minutes: number;

  @ApiProperty({
    example: 'Tribunal de première instance de Yaoundé',
    required: false,
  })
  @IsInt()
  @IsOptional()
  jurisdiction_id?: number;

  @ApiProperty({
    example: 'Salle 4',
    required: false,
  })
  @IsString()
  @IsOptional()
  room?: string;

  @ApiProperty({
    example: 'Hon. Ndongo Patrice',
    required: false,
  })
  @IsString()
  @IsOptional()
  judge_name?: string;

  @ApiProperty({
    example: 'Audience de mise en état',
    required: false,
  })
  @IsString()
  @IsOptional()
  type: any;
  
  @ApiProperty({
    example: 'Audience Type',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  audience_type_id: number;

  @ApiProperty({
    example: 'Affaire reportée faute de partie adverse',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    example: 'Identifiants des documents',
    required: false,
  })
  @IsArray()
  @IsOptional()
  document_ids: number[]; // Liste des destinataires principaux


  @ApiProperty({
    example: '2025-11-05T09:00:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  postponed_to?: Date;

  @ApiProperty({ required: false, description: 'ID UUID de la visite d\'étape courante (optionnel — priorité sur la détection automatique)' })
  @IsUUID()
  @IsOptional()
  stage_visit_id?: string;

  @ApiProperty({ required: false, description: 'ID UUID de la visite de sous-étape courante (optionnel — priorité sur la détection automatique)' })
  @IsUUID()
  @IsOptional()
  sub_stage_visit_id?: string;

  /** Transient — case « Notifier le client » du modal. */
  @ApiPropertyOptional({
    description: "Notifier le client par e-mail à la création de l'audience",
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  notify_client?: boolean;
}
