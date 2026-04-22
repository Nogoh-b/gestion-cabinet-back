// update-audience.dto.ts
import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateAudienceDto } from './create-audience.dto';
import { IsArray, IsOptional, IsInt, IsDateString, IsString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { AudienceStatus } from '../entities/audience.entity';

export class UpdateAudienceDto extends PartialType(CreateAudienceDto) {
  @ApiProperty({
    example: 1,
    description: "Identifiant de la juridiction",
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => value === null ? undefined : value) // Transformer null en undefined
  jurisdiction_id?: number;

  @ApiProperty({
    example: [1, 2, 3],
    description: "Identifiants des documents",
    required: false,
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => value === null ? undefined : value) // Transformer null en undefined
  document_ids?: number[];

  @ApiProperty({
    example: 12,
    description: "Identifiant du dossier",
    required: false,
  })
  @IsOptional()
  @IsInt()
  dossier_id?: number;

  @ApiProperty({
    example: '2025-10-20',
    description: "Date prévue pour l'audience",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  audience_date?: Date;

  @ApiProperty({
    example: '09:00:00',
    description: "Heure prévue pour l'audience",
    required: false,
  })
  @IsOptional()
  @IsString()
  audience_time?: string;

  @ApiProperty({
    example: 60,
    description: "Durée prévue pour l'audience en minutes",
    required: false,
  })
  @IsOptional()
  @IsInt()
  duration_minutes?: number;

  @ApiProperty({
    example: 'Salle 4',
    required: false,
  })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiProperty({
    example: 'Raison',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    example: 'Hon. Ndongo Patrice',
    required: false,
  })
  @IsOptional()
  @IsString()
  judge_name?: string;

  @ApiProperty({
    example: 'Audience de mise en état',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;
  
  @ApiProperty({
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  audience_type_id?: number;

  @ApiProperty({
    example: 'Affaire reportée faute de partie adverse',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: '2025-11-05',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  postponed_to?: Date;


  @IsOptional()
  status?: AudienceStatus;
}