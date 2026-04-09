import { PartialType } from '@nestjs/swagger';
import { CreateInvoiceTypeDto } from './create-invoice-type.dto';

export class UpdateInvoiceTypeDto extends PartialType(CreateInvoiceTypeDto) {}
