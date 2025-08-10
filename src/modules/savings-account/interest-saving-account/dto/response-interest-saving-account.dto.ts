import { ApiProperty } from '@nestjs/swagger';
import { CreateInterestSavingAccountDto } from './create-interest-saving-account.dto';

export class InterestSavingAccountResponseDto extends CreateInterestSavingAccountDto {
  @ApiProperty({ description: 'ID du taux d’intérêt' })
  id: number;
}
