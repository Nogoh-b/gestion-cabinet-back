import { PartialType } from '@nestjs/swagger';
import { CreateSavingsAccountDto } from './create-savings-account.dto';

export class UpdateSavingsAccountDto extends PartialType(CreateSavingsAccountDto) {}
