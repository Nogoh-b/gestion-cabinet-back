import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendClientMessageDto {
  @ApiProperty({ description: 'Contenu du message', maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ description: 'Dossier concerné (facultatif)' })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === '' || value === undefined
      ? undefined
      : Number(value),
  )
  @IsInt()
  dossier_id?: number;
}
