import { ApiProperty } from '@nestjs/swagger';
import {
    IsNumber,
    IsInt
} from 'class-validator';

export class CreateInterestSavingAccountDto {
  @ApiProperty({ description: 'Durée en mois', example: 6 })
  @IsInt()
  duree_mois: number;

  @ApiProperty({ description: 'Taux d’intérêt', example: 1.5 })
  @IsNumber()
  taux: number;
}
