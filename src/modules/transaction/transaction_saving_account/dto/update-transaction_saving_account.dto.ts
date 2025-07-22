import { PartialType } from '@nestjs/swagger';
import { CreateTransactionSavingsAccountDto } from './create-transaction_saving_account.dto';

export class UpdateTransactionSavingsAccountDto extends PartialType(CreateTransactionSavingsAccountDto) {}
