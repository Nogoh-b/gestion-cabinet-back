import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateSavingsAccountDto } from './create-savings-account.dto';
import {
    IsOptional, IsISO8601
} from 'class-validator';

export class UpdateSavingsAccountDto extends PartialType(CreateSavingsAccountDto) {}

export class UpdateInterestRateOfSavingAccountDto {
  @ApiPropertyOptional({ description: 'Date de début d’application', type: String })
  @IsOptional()
  @IsISO8601()
  begin_date?: string;

  @ApiPropertyOptional({ description: 'Date de fin d’application', type: String })
  @IsOptional()
  @IsISO8601()
  end_date?: string;
}
