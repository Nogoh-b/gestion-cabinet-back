import { PartialType } from '@nestjs/swagger';
import { CreateCommercialDto } from './create-commercial.dto';

export class UpdateCommercialDto extends PartialType(CreateCommercialDto) {}
