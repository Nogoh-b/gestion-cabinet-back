import { PartialType } from '@nestjs/swagger';
import { CreateDocumentCategoryDto } from './create-document-category.dto';

export class UpdateDocumentCategoryDto extends PartialType(CreateDocumentCategoryDto) {}
