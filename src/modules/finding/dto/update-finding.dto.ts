import { PartialType } from '@nestjs/swagger';
import { CreateFindingDto } from './create-finding.dto';

export class UpdateFindingDto extends PartialType(CreateFindingDto) {}
