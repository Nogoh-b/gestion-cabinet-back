// dto/create-step.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsDate, IsUUID, IsObject, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


import { StepStatus } from '../entities/step.entity';




export enum StepType {
  OPENING = 'opening',
  AMIABLE = 'amiable',
  CONTENTIOUS = 'contentious',
  DECISION = 'decision',
  APPEAL = 'appeal',
  CLOSURE = 'closure'
}



export class CreateStepDto {
  @ApiProperty({
    enum: StepType,
    description: 'Type de l\'étape du dossier'
  })
  @IsEnum(StepType)
  type: StepType;

  @ApiProperty({
    enum: StepStatus,
    description: 'Statut de l\'étape',
    default: StepStatus.PENDING
  })
  @IsEnum(StepStatus)
  @IsOptional()
  status?: StepStatus;

  @ApiProperty({
    description: 'Titre de l\'étape'
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'ID du dossier de l\'étape'
  })
  @IsString()
  dossierId: number;

  @ApiPropertyOptional({
    description: 'Description détaillée de l\'étape'
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Date prévue pour cette étape'
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  scheduledDate?: Date;

  @ApiPropertyOptional({
    description: 'ID de l\'utilisateur assigné à cette étape'
  })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Métadonnées supplémentaires pour l\'étape',
    example: {
      decision: 'Accord partiel',
      court: 'Tribunal de commerce',
      hearingDate: '2024-01-15T10:00:00.000Z',
      agreementReached: false
    }
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

// dto/handle-amiable-phase.dto.ts

export class HandleAmiablePhaseDto {
  @ApiProperty({
    description: 'Indique si un accord amiable a été trouvé'
  })
  @IsBoolean()
  agreementReached: boolean;
}


// dto/initiate-appeal.dto.ts

export class InitiateAppealDto {
  @ApiProperty({
    description: 'Type de recours (appel, pourvoi, etc.)'
  })
  @IsString()
  appealType: string;
}


// dto/move-to-next-step.dto.ts

export class MoveToNextStepDto {
  @ApiProperty({
    enum: StepType,
    description: 'Type de l\'étape courante'
  })
  @IsEnum(StepType)
  currentStepType: StepType;
}