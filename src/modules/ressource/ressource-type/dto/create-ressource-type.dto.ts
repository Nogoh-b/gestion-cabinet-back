import { ApiProperty } from "@nestjs/swagger";





export class CreateRessourceTypeDto {
 
  @ApiProperty({ example: 'Carnet de chèque' })
  name: string;

  
  @ApiProperty({ example: 'CARNET' })
  code: string;  

  @ApiProperty({ example: 100 })
  amount: number;

  
  @ApiProperty({ required: false })
  swift_code: string;

  
  @ApiProperty({ required: false })
  bank_code: string;

  
  @ApiProperty({ required: false })
  account_number: string;

  
  @ApiProperty({ required: false })
  key: string;

  
  @ApiProperty({ required: false })
  iban: string;

  
  @ApiProperty({ required: false })
  account_label: string;
}

