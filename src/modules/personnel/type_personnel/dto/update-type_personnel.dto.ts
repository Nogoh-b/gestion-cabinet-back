import { PartialType } from '@nestjs/mapped-types';
import { CreateTypePersonnelDto } from './create-type_personnel.dto';

export class UpdateTypePersonnelDto extends PartialType(CreateTypePersonnelDto) {}