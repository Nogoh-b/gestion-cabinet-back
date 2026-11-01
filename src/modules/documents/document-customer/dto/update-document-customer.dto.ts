import { PartialType } from '@nestjs/mapped-types';

import { CreateDocumentCustomerDto } from './create-document-customer.dto';

import { DocumentCustomerStatus } from 'src/modules/documents/document-customer/entities/document-customer.entity';

export class UpdateDocumentCustomerDto extends PartialType(
  CreateDocumentCustomerDto,
) {
  status?: DocumentCustomerStatus;
}
