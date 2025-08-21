import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';











export enum RessourceChannel {
  BRANCH = 'BRANCH',
  OM = 'OM',
  MOMO = 'MOMO',
}

export class CreateRessourceDto {
  // @ApiProperty({ example: 1 })
  ressource_type_id: number;

  // @ApiProperty({ example: 42 })
  savings_account_id: number;

  @ApiProperty({ required: true, example: 1 })
  @IsNumber()
  branch_id: number;

  @ApiProperty({ required: false, example: 1 })
  @IsNumber()
  quantity: number;


  @ApiProperty({ required: false, enum: RessourceChannel, example: RessourceChannel.BRANCH })
  channel?: RessourceChannel; 

  // @ApiProperty({ required: false, example: 1 })
  status?: number;
}
