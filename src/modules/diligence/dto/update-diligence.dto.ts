import { PartialType } from '@nestjs/swagger';
import { CreateDiligenceDto } from './create-diligence.dto';

export class UpdateDiligenceDto extends PartialType(CreateDiligenceDto) {}
