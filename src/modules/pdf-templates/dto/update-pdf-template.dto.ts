import { PartialType } from '@nestjs/swagger';
import { CreatePdfTemplateDto } from './create-pdf-template.dto';

export class UpdatePdfTemplateDto extends PartialType(CreatePdfTemplateDto) {}
