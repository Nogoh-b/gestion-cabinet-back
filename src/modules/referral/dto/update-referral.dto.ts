// update-referrer.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateReferrerDto } from './create-referral.dto';

export class UpdateReferrerDto extends PartialType(CreateReferrerDto) {}