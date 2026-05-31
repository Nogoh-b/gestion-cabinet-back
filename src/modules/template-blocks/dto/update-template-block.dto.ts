import { PartialType } from '@nestjs/swagger';
import { CreateTemplateBlockDto } from './create-template-block.dto';

export class UpdateTemplateBlockDto extends PartialType(CreateTemplateBlockDto) {}
