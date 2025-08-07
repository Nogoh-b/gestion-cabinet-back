import { IsInt, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


export class CreatePersonnelDto {
  @IsInt()
  @ApiProperty({ example: 1 })
  type_personnel_id: number;

  @IsInt()
  @ApiProperty({ example: 2 })
  customer_id: number;


  @Length(1, 20)
  @ApiProperty({ example: 'PROMO2025CODEX' })
  code: string;
}
