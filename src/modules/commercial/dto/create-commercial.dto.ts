// src/commercial/dto/create-commercial.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommercialDto {
  @ApiProperty({ description: 'Nom du commercial' })
  readonly name: string;

  @ApiProperty({ description: 'Email unique du commercial' })
  readonly email: string;
}
