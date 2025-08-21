import { PartialType } from '@nestjs/swagger';
import { CreateRessourceDto } from './create-ressource.dto';

export class UpdateRessourceDto extends PartialType(CreateRessourceDto) {}
