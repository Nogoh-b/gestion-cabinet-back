// src/modules/audiences/dto/create-audience.dto.ts
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';




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
  @IsNotEmpty()
  audience_date: Date;

  @ApiProperty({
    example: '09:00:00',
    description: "Heure prévue pour l'audience",
  })
  @IsDateString()
  @IsNotEmpty()
  audience_time: string;

  @ApiProperty({
    example: 60,
    description: "Durée prévue pour l'audience en minutes",
  })
  @IsInt()
  duration_minutes: number;

  @ApiProperty({
    example: 'Tribunal de première instance de Yaoundé',
    required: false,
  })
  @IsString()
  @IsOptional()
  jurisdiction?: string;

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
  type?: string;

  @ApiProperty({
    example: 'Affaire reportée faute de partie adverse',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    example: '2025-11-05T09:00:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  postponed_to?: Date;
}
