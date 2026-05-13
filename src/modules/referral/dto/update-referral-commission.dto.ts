// update-referral-commission.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateReferralCommissionDto } from './create-referral-commission.dto';

export class UpdateReferralCommissionDto extends PartialType(CreateReferralCommissionDto) {}