import { PartialType } from '@nestjs/swagger';
import { CreateTransactionTypeDto } from './create-transaction_type.dto';

export class UpdateTransactionTypeDto extends PartialType(CreateTransactionTypeDto) {}
