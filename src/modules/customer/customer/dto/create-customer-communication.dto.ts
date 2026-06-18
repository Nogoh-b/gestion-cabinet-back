import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CommunicationStatus,
  CommunicationType,
} from '../entities/customer-communication.entity';

/**
 * DTO de création d'une communication client (appel, email, réunion, courrier…).
 *
 * Le backend n'active pas de ValidationPipe globale : les valeurs sont reçues
 * telles quelles. Les décorateurs class-validator documentent le contrat et les
 * `@Transform` assurent la coercition (chaînes -> nombres) côté service.
 */
export class CreateCustomerCommunicationDto {
  @ApiProperty({
    enum: CommunicationType,
    description: 'Type de communication',
    example: CommunicationType.PHONE,
  })
  @IsEnum(CommunicationType)
  type: CommunicationType;

  @ApiProperty({ description: 'Objet / sujet de la communication' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiPropertyOptional({ description: 'Contenu / notes détaillées' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Date de la communication (ISO). Par défaut: maintenant.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    enum: CommunicationStatus,
    description: 'Statut de la communication',
    default: CommunicationStatus.SENT,
  })
  @IsOptional()
  @IsEnum(CommunicationStatus)
  status?: CommunicationStatus;

  @ApiPropertyOptional({ description: 'Durée en minutes (pour les appels)' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  duration?: number;

  @ApiPropertyOptional({ description: 'Participants à la communication' })
  @IsOptional()
  @IsString()
  participants?: string;
}
