import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCommercialDto } from './create-commercial.dto';

export class UpdateCommercialDto extends PartialType(CreateCommercialDto) {}

export class UpdateCommercialStatusDto {
  @ApiProperty({ description: 'Statut du partenaire (1=actif, 0=inactif)' })
  readonly status: number;
}
