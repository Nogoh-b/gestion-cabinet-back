import { ApiProperty } from "@nestjs/swagger";







export class CreateRessourceTypeDto {
 
  @ApiProperty({ example: 'Carnet de chèque' })
  name: string;

  
  @ApiProperty({ example: 'CARNET' })
  code: string;  
  
  @ApiProperty({ example: 'CARNET' })
  description: string;  

  @ApiProperty({ example: 100 })
  amount: number;


}

