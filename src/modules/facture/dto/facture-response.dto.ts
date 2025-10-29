// src/facture/dto/facture-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { StatutFacture, TypeFacture } from './create-facture.dto';

export class FactureResponseDto {
  @ApiProperty({ description: 'ID de la facture' })
  id: string;

  @ApiProperty({ description: 'ID du dossier associé' })
  dossierId: string;

  @ApiProperty({ description: 'ID du client' })
  clientId: string;

  @ApiProperty({ enum: TypeFacture, description: 'Type de facture' })
  type: TypeFacture;

  @ApiProperty({ description: 'Numéro de facture' })
  numero: string;

  @ApiProperty({ description: 'Date de la facture' })
  dateFacture: Date;

  @ApiProperty({ description: 'Date d\'échéance' })
  dateEcheance: Date;

  @ApiProperty({ description: 'Montant HT' })
  montantHT: number;

  @ApiProperty({ description: 'Taux de TVA' })
  tauxTVA: number;

  @ApiProperty({ description: 'Montant TVA' })
  montantTVA: number;

  @ApiProperty({ description: 'Montant TTC' })
  montantTTC: number;

  @ApiProperty({ description: 'Montant déjà payé' })
  montantPaye: number;

  @ApiProperty({ description: 'Reste à payer' })
  resteAPayer: number;

  @ApiProperty({ description: 'Description des prestations' })
  description: string;

  @ApiProperty({ enum: StatutFacture, description: 'Statut de la facture' })
  statut: StatutFacture;

  @ApiProperty({ description: 'Notes internes' })
  notesInternes: string;

  @ApiProperty({ description: 'Date de création' })
  created_at: Date;

  @ApiProperty({ description: 'Date de modification' })
  updated_at: Date;

  @ApiProperty({ description: 'Paiements associés', type: [Object], required: false })
  paiements?: any[];
}