import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DossierPaymentAllocationDto {
  @IsUUID()
  facture_id: string;

  @IsNumber()
  @Min(0.01)
  montant: number;
}

/**
 * Encaissement groupé sur un dossier : soit des factures cochées avec leur
 * montant, soit un montant global ventilé automatiquement des échéances les
 * plus anciennes aux plus récentes. Les autres champs d'encaissement sont
 * facultatifs (mode, dates et référence ont des valeurs par défaut).
 */
export class AllocateDossierPaymentDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DossierPaymentAllocationDto)
  allocations?: DossierPaymentAllocationDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  montant_total?: number;

  @IsOptional()
  mode_paiement?: unknown;

  @IsOptional()
  @IsDateString()
  date_paiement?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  banque?: string;

  @IsOptional()
  @IsString()
  titulaire?: string;

  @IsOptional()
  @IsString()
  numero_cheque?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Trop-perçu converti en avoir (défaut : true). */
  @IsOptional()
  @IsBoolean()
  create_avoir?: boolean;
}
