// src/paiement/dto/paiement-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { ModePaiement, StatutPaiement } from './create-paiement.dto';

export class PaiementResponseDto {
  @ApiProperty({ description: 'ID du paiement' })
  id: string;

  @ApiProperty({ description: 'ID de la facture associée' })
  factureId: string;

  @ApiProperty({ description: 'Montant du paiement' })
  montant: number;

  @ApiProperty({ enum: ModePaiement, description: 'Mode de paiement' })
  mode: ModePaiement;

  @ApiProperty({ description: 'Date du paiement' })
  datePaiement: Date;

  @ApiProperty({ description: 'Date de valeur' })
  dateValeur: Date;

  @ApiProperty({ description: 'Référence du paiement' })
  reference: string;

  @ApiProperty({ description: 'Numéro de chèque' })
  numeroCheque: string;

  @ApiProperty({ description: 'Banque émettrice' })
  banque: string;

  @ApiProperty({ description: 'Titulaire du compte' })
  titulaire: string;

  @ApiProperty({ enum: StatutPaiement, description: 'Statut du paiement' })
  statut: StatutPaiement;

  @ApiProperty({ description: 'Notes' })
  notes: string;

  @ApiProperty({ description: 'Preuve de paiement' })
  preuvePaiement: string;

  @ApiProperty({ description: 'Date de création' })
  created_at: Date;

  @ApiProperty({ description: 'Date de modification' })
  updated_at: Date;

  @ApiProperty({ description: 'Facture associée', required: false })
  facture?: any;
}