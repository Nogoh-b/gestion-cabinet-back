import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
export class UpdatePartnerStatusDto {
  @ApiProperty({ description: 'Statut du partenaire (1=actif, 0=inactif)' })
  readonly status: number;
}