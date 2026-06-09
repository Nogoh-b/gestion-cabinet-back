import { PartialType } from '@nestjs/mapped-types';

import { CreateDocumentCustomerDto } from './create-document-customer.dto';


export class UpdateDocumentCustomerDto extends PartialType(CreateDocumentCustomerDto) {}