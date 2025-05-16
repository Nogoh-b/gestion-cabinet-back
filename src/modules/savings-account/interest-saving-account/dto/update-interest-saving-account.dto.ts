import { PartialType } from '@nestjs/swagger';
import { CreateInterestSavingAccountDto } from './create-interest-saving-account.dto';

export class UpdateInterestSavingAccountDto extends PartialType(CreateInterestSavingAccountDto) {}
