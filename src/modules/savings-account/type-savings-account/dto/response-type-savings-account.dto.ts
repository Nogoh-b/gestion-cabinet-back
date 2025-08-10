
import { ApiProperty } from '@nestjs/swagger';
import { CreateTypeSavingsAccountDto } from './create-type-savings-account.dto';

export class TypeSavingsAccountResponseDto extends CreateTypeSavingsAccountDto {
  @ApiProperty({ description: 'ID du type de compte' })
  id: number;

  @ApiProperty({ description: 'Date de création' })
  created_at: Date;

  @ApiProperty({ description: 'Date de mise à jour' })
  updated_at: Date;
}
