import { PartialType } from '@nestjs/swagger';
import { CreateActivitiesUserDto } from './create-activities-user.dto';

export class UpdateActivitiesUserDto extends PartialType(CreateActivitiesUserDto) {}
