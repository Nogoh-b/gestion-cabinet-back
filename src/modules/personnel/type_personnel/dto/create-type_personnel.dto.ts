import { IsNotEmpty, IsInt, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';




export class CreateTypePersonnelDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'Directeur General' })
  title: string;

  @IsInt()
  @ApiProperty({ example: 5 })
  max_transaction_blocked: number;

  @IsString()
  @Length(1, 10)
  @ApiProperty({ example: 'DG' })
  code: string;
}
