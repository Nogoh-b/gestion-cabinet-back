// src/partner/dto/create-partner.dto.ts
import { ApiProperty } from '@nestjs/swagger';



export class CreatePartnerDto {
  @ApiProperty({ description: 'Promo code' })
   promo_code: string;

//   @ApiProperty({ description: 'Promo code owner' })
   name: string;

  @ApiProperty({ description: 'ID du client lié' })
  readonly customer_id: number;
  
   status: number;
}
