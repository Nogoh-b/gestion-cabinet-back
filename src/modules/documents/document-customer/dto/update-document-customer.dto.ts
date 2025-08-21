import { PartialType } from '@nestjs/swagger';
import { CreateDocumentCustomerDto } from './create-document-customer.dto';

export class UpdateDocumentCustomerDto extends PartialType(CreateDocumentCustomerDto) {}
