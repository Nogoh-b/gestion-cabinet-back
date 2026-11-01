import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDiligenceDto } from './create-diligence.dto';

export class UpdateDiligenceDto extends PartialType(
  OmitType(CreateDiligenceDto, [
    'dossier_id',
    'stage_visit_id',
    'sub_stage_visit_id',
    'notify_client',
  ] as const),
) {}
