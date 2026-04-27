import { IsString, IsOptional, IsArray, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AskQuestionDto {
  @ApiProperty({ 
    description: 'Question en langage naturel sur votre base de données',
    example: 'Quel est le taux de succès par avocat pour 2025 ?'
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  question: string;

  @ApiProperty({ 
    description: 'Tables spécifiques à utiliser (optionnel)',
    required: false,
    example: ['dossiers', 'employee', 'audiences']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificTables?: string[];

  @ApiProperty({ 
    description: 'Mode verbose pour voir les étapes intermédiaires',
    required: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  verbose?: boolean;
}