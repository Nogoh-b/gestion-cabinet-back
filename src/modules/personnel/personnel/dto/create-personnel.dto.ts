import { IsInt, IsOptional, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';



export class CreatePersonnelDto {
  @IsInt()
  @ApiProperty({ example: 1 })
  type_personnel_id: number;

  @IsInt()
  @ApiProperty({ example: 2 })
  customer_id: number;

  @IsInt()
  @ApiProperty({ example: true })
  is_intern: boolean;


  @Length(1, 20)
  @ApiProperty({ example: 'Mous' })
  name: string;

  @Length(1, 20)
  @ApiProperty({ example: 'PROMO2025CODEX' })
  code: string;

  @Length(1, 20)
  @IsOptional()
  @ApiProperty({ example: 'PROMO2025CODEX' })
  sub_code?: string | null;

  status : number
}
