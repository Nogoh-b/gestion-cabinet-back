import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CloseExerciceDto {
  @ApiProperty({
    description:
      'Rapport de clôture décrivant les contrôles, anomalies et décisions',
    minLength: 20,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(10000)
  rapportCloture: string;

  @ApiProperty({
    description:
      'Référence du dossier ou rapport de rapprochement validé',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  referenceRapprochement: string;

  @ApiProperty({
    description:
      'Confirmation explicite que les rapprochements ont été contrôlés',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  rapprochementsValides: true;
}
