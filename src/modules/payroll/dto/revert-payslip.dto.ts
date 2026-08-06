import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevertPayslipDto {
  @ApiProperty({
    example: 'Correction nécessaire après contrôle du montant brut',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
