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

  @ApiProperty({ required: false, example: 'BICMCMCX' })
  swift_code?: string;

  @ApiProperty({ required: false, example: '01001' })
  bank_code?: string;

  @ApiProperty({ required: false, example: '00012345678' })
  account_number?: string;

  @ApiProperty({ required: false, example: '85' })
  key?: string;

  @ApiProperty({ required: false, example: 'CM1234567890123456789012345' })
  iban?: string;

  @ApiProperty({ required: false, example: 'Compte courant client' })
  account_label?: string;

  @ApiProperty({ required: false, enum: RessourceChannel, example: RessourceChannel.BRANCH })
  channel?: RessourceChannel;


  // @ApiProperty({ required: false, example: 1 })
  status?: number;
}
