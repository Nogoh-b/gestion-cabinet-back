import { PartialType } from '@nestjs/swagger';
import { CreateDossierReferralDto } from './create-dossier-referral.dto';

export class UpdateDossierReferralDto extends PartialType(CreateDossierReferralDto) {}