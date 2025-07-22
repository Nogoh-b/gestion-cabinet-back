import { PartialType } from '@nestjs/swagger';
import { CreateRessourceTypeDto } from './create-ressource-type.dto';

export class UpdateRessourceTypeDto extends PartialType(CreateRessourceTypeDto) {}
