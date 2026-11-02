import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class InvoiceCancelDto {
  @ApiProperty({
    description: 'Motif métier explicite et auditable',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  raison: string;
}
