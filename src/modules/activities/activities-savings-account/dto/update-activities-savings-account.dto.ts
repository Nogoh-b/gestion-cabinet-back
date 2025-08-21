import { PartialType } from '@nestjs/swagger';
import { CreateActivitiesSavingsAccountDto } from './create-activities-savings-account.dto';

export class UpdateActivitiesSavingsAccountDto extends PartialType(CreateActivitiesSavingsAccountDto) {}
