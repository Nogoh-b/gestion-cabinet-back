// src/facture/dto/update-facture.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateFactureDto } from './create-facture.dto';

export class UpdateFactureDto extends PartialType(CreateFactureDto) {}