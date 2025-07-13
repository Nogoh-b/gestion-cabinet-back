// src/partner/dto/create-partner.dto.ts
import { ApiProperty } from '@nestjs/swagger';



export class CreatePartnerDto {
  @ApiProperty({ description: 'Nom du partenaire' })
  readonly name: string;

  @ApiProperty({ description: 'ID du client lié' })
  readonly customer_id: number;
  
   status: number;
}
