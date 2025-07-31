import { ApiProperty } from '@nestjs/swagger';



export class CreateRessourceDto {
  @ApiProperty()
  ressource_type_id: number;

  @ApiProperty()
  savings_account_id: number;

  @ApiProperty({ required: false })
  status?: number;
}