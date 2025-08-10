import { PartialType } from '@nestjs/swagger';
import { CreateDocumentSavingAccountDto } from './create-document-saving-account.dto';

export class UpdateDocumentSavingAccountDto extends PartialType(CreateDocumentSavingAccountDto) {}
