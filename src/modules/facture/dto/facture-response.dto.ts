// src/facture/dto/facture-response.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { CustomerResponseDto } from 'src/modules/customer/customer/dto/customer-response.dto';
import { DossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';
import { ApiProperty } from '@nestjs/swagger';

import { StatutFacture, TypeFacture } from './create-facture.dto';
import { InvoiceType } from 'src/modules/invoice-type/entities/invoice-type.entity';

type FactureTransformSource = {
  dateEcheance?: string | number | Date | null;
  resteAPayer?: unknown;
};

export class FactureLineResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  label: string;

  @ApiProperty()
  @Expose()
  quantity: number;

  @ApiProperty()
  @Expose()
  unit_price: number;

  @ApiProperty()
  @Expose()
  net_amount: number;

  @ApiProperty()
  @Expose()
  tax_rate: number;

  @ApiProperty()
  @Expose()
  tax_amount: number;

  @ApiProperty()
  @Expose()
  gross_amount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  billable_item_id?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  category?: string | null;
}

export class FactureResponseDto {
  @ApiProperty({ description: 'ID de la facture' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Identifiant du dossier associé' })
  @Expose()
  dossier_id: number;

  @ApiProperty({ description: 'Identifiant du client associé' })
  @Expose()
  client_id: number;

  @ApiProperty({ description: 'Devise figée de la facture', nullable: true })
  @Expose()
  currency: string | null;

  @ApiProperty({ description: 'Type de facture', enum: TypeFacture })
  @Expose()
  type: TypeFacture;

  @ApiProperty({ description: 'Numéro de facture' })
  @Expose()
  numero: string;

  @ApiProperty({ description: 'Libellé utilisé de la facture', nullable: true })
  @Expose()
  libelle: string | null;

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
  status: StatutFacture;

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

  @ApiProperty({ type: [Object], required: false })
  @Expose()
  paiements?: Record<string, unknown>[];

  @ApiProperty({ type: () => [FactureLineResponseDto], required: false })
  @Expose()
  @Type(() => FactureLineResponseDto)
  lines?: FactureLineResponseDto[];

  // ✅ Champs calculés
  @ApiProperty({ description: 'Jours de retard' })
  @Expose()
  @Transform(({ obj }) => {
    const source = obj as FactureTransformSource;
    if (!source.dateEcheance) return 0;
    const diff = Date.now() - new Date(source.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 ? jours : 0;
  })
  jours_retard: number;

  @ApiProperty({ description: 'Facture en retard ?' })
  @Expose()
  @Transform(({ obj }) => {
    const source = obj as FactureTransformSource;
    if (!source.dateEcheance) return false;
    const diff = Date.now() - new Date(source.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 && Number(source.resteAPayer ?? 0) > 0;
  })
  is_en_retard: boolean;
}
