import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFindingDto } from './create-finding.dto';

export class UpdateFindingDto extends PartialType(
  OmitType(CreateFindingDto, ['diligence_id', 'notify_client'] as const),
) {}
