import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Une visite guidée jouée jusqu'au bout ou interrompue. */
export class OnboardingTourEventDto {
  @ApiProperty({ example: 'page:dossier' })
  @IsString()
  @MaxLength(64)
  tour_id: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  version: number;

  @ApiProperty({ enum: ['completed', 'abandoned'] })
  @IsIn(['completed', 'abandoned'])
  outcome: 'completed' | 'abandoned';

  @ApiProperty({ description: 'Dernière étape affichée (1 = première)' })
  @IsInt()
  @Min(0)
  @Max(100)
  step_reached: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(100)
  steps_total: number;

  @ApiPropertyOptional({ enum: ['auto', 'replay'] })
  @IsOptional()
  @IsIn(['auto', 'replay'])
  trigger?: 'auto' | 'replay';
}

/** Remise à zéro des visites : des membres choisis, ou toute l'équipe sans `user_ids`. */
export class OnboardingTeamResetDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  user_ids?: number[];
}
