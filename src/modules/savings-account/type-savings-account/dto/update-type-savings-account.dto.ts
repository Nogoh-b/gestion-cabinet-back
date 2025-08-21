import { PartialType } from '@nestjs/swagger';
import { CreateTypeSavingsAccountDto } from './create-type-savings-account.dto';

export class UpdateTypeSavingsAccountDto extends PartialType(CreateTypeSavingsAccountDto) {}
