import { ApiProperty } from "@nestjs/swagger";







export class CreateRessourceTypeDto {
 
  @ApiProperty({ example: 'Carnet de chèque' })
  name: string;

  
  @ApiProperty({ example: 'CARNET' })
  code: string;  
  
  @ApiProperty({ example: 'CARNET' })
  description: string;  
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



  @ApiProperty({ example: 100 })
  quantity: number;

  @ApiProperty({ example: 100 })
  amount: number;


}

