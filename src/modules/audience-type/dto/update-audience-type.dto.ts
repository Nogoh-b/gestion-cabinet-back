import { PartialType } from '@nestjs/swagger';
import { CreateAudienceTypeDto } from './create-audience-type.dto';

export class UpdateAudienceTypeDto extends PartialType(CreateAudienceTypeDto) {}
