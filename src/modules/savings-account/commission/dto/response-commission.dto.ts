
import { ApiProperty } from '@nestjs/swagger';
import { CreateCommissionDto } from './create-commission.dto';

export class CommissionResponseDto extends CreateCommissionDto {
  @ApiProperty({ description: 'ID de la commission' })
  id: number;
}

