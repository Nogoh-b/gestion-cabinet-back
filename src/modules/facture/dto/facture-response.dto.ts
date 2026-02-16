// src/facture/dto/facture-response.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { CustomerResponseDto } from 'src/modules/customer/customer/dto/customer-response.dto';
import { DossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';
import { ApiProperty } from '@nestjs/swagger';

import { StatutFacture, TypeFacture } from './create-facture.dto';
import { InvoiceType } from 'src/modules/invoice-type/entities/invoice-type.entity';


export class FactureResponseDto {
  @ApiProperty({ description: 'ID de la facture' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Type de facture', enum: TypeFacture })
  @Expose()
  type: TypeFacture;

  @ApiProperty({ description: 'Numéro de facture' })
  @Expose()
  numero: string;

  @ApiProperty({ description: 'Date de la facture' })
  @Expose()
  @Type(() => Date)
  dateFacture: Date;

  @ApiProperty({ description: "Date d'échéance de la facture" })
  @Expose()
  @Type(() => Date)
  dateEcheance: Date;

  @ApiProperty()
  @Expose()
  montantHT: number;

  @ApiProperty()
  @Expose()
  tauxTVA: number;

  @ApiProperty()
  @Expose()
  montantTVA: number;

  @ApiProperty()
  @Expose()
  montantTTC: number;

  @ApiProperty()
  @Expose()
  montantPaye: number;

  @ApiProperty()
  @Expose()
  resteAPayer: number;

  @ApiProperty({ enum: StatutFacture })
  @Expose()
  statut: StatutFacture;

  @ApiProperty()
  @Expose()
  description: string;

  @ApiProperty()
  @Expose()
  notesInternes: string;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  created_at: Date;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  updated_at: Date;

  // ✅ Relations exposées
  @ApiProperty({ type: () => DossierResponseDto })
  @Expose()
  @Type(() => DossierResponseDto)
  dossier: DossierResponseDto;

  @ApiProperty({ type: () => InvoiceType })
  @Expose()
  @Type(() => InvoiceType)
  invoice_type: InvoiceType;

  @ApiProperty({ type: () => CustomerResponseDto })
  @Expose()
  @Type(() => CustomerResponseDto)
  client: CustomerResponseDto;

  // ✅ Champs calculés
  @ApiProperty({ description: 'Jours de retard' })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dateEcheance) return 0;
    const diff = Date.now() - new Date(obj.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 ? jours : 0;
  })
  jours_retard: number;

  @ApiProperty({ description: 'Facture en retard ?' })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dateEcheance) return false;
    const diff = Date.now() - new Date(obj.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 && obj.resteAPayer > 0;
  })
  is_en_retard: boolean;
}
