// src/paiement/dto/paiement-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { ModePaiement, StatutPaiement } from './create-paiement.dto';
import { Transform, Type } from 'class-transformer';

// DTO pour le client simplifié (imbriqué dans facture)
class ClientPaiementDto {
  @ApiProperty({ description: 'ID du client' })
  id: number;

  @ApiProperty({ description: 'Nom de la société' })
  company_name: string;

  @ApiProperty({ description: 'Nom complet du client' })
  full_name: string;
}

// DTO pour le dossier simplifié (imbriqué dans facture)
class DossierPaiementDto {
  @ApiProperty({ description: 'ID du dossier' })
  id: number;

  @ApiProperty({ description: 'Numéro de dossier' })
  dossier_number: string;
}

// DTO pour la facture avec client et dossier imbriqués
class FacturePaiementDto {
  @ApiProperty({ description: 'Numéro de facture' })
  numero: string;

  @ApiProperty({ description: 'Notes internes' })
  notesInternes: string;

  @ApiProperty({ description: 'Montant TTC' })
  montantTTC: number;

  @ApiProperty({ description: 'Statut de la facture' })
  status: number;

  @ApiProperty({ type: ClientPaiementDto, description: 'Client associé à la facture' })
  @Type(() => ClientPaiementDto)
  client: ClientPaiementDto;

  @ApiProperty({ type: DossierPaiementDto, description: 'Dossier associé à la facture' })
  @Type(() => DossierPaiementDto)
  dossier: DossierPaiementDto;
}

export class PaiementResponseDto {
  @ApiProperty({ description: 'ID du paiement' })
  id: string;

  @ApiProperty({ description: 'ID de la facture associée' })
  factureId: string;

  @ApiProperty({ description: 'Montant du paiement' })
  @Transform(({ value }) => parseFloat(value))
  montant: number;

  @ApiProperty({ enum: ModePaiement, description: 'Mode de paiement' })
  modePaiement: ModePaiement;

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
  @Transform(({ obj }) => obj.status)
  statut: StatutPaiement;

  @ApiProperty({ description: 'Notes' })
  notes: string;

  @ApiProperty({ description: 'Preuve de paiement' })
  preuvePaiement: string;

  @ApiProperty({ description: 'Date de création' })
  created_at: Date;

  @ApiProperty({ description: 'Date de modification' })
  updated_at: Date;

  @ApiProperty({ type: FacturePaiementDto, description: 'Facture associée avec client et dossier' })
  @Type(() => FacturePaiementDto)
  @Transform(({ obj }) => {
    if (!obj.facture) return null;
    
    return {
      numero: obj.facture.numero,
      notesInternes: obj.facture.notesInternes || '',
      montantTTC: parseFloat(obj.facture.montantTTC || '0'),
      status: obj.facture.status,
      client: obj.facture.client ? {
        id: obj.facture.client.id,
        company_name: obj.facture.client.company_name || null,
        full_name: `${obj.facture.client.full_name || ''} `.trim()
      } : null,
      dossier: obj.facture.dossier ? {
        id: obj.facture.dossier.id,
        dossier_number: obj.facture.dossier.dossier_number
      } : null
    };
  })
  facture: FacturePaiementDto;
}