// src/commercial/dto/create-commercial.dto.ts
import { ApiProperty } from '@nestjs/swagger';


export class CreateCommercialDto {
//   @ApiProperty({ description: 'Nom du partenaire' })
//   readonly name: string;
   name: string;

  @ApiProperty({ description: 'ID du client lié' })
  readonly customer_id: number;
  
   status: number;
}
