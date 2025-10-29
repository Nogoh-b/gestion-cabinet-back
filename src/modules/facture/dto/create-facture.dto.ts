// src/facture/dto/create-facture.dto.ts
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDate, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export enum StatutFacture {
  BROUILLON = 0,
  ENVOYEE = 1,
  PARTIELLEMENT_PAYEE = 2,
  PAYEE = 3,
  IMPAYEE = 4,
  ANNULEE = 5
}

export enum TypeFacture {
  HONORAIRES = 0,
  FRAIS_PROCEDURE = 1,
  DILIGENCES = 2,
  AUTRES = 3
}

export class CreateFactureDto {
  @ApiProperty({
    description: 'ID du dossier associé',
    example: 12,
  })
  @IsNumber()
  dossierId: number;

  @ApiProperty({
    description: 'ID du client concerné',
    example: 7,
  })
  @IsNumber()
  clientId: number;

  @ApiProperty({
    enum: TypeFacture,
    description: 'Type de facture',
    example: TypeFacture.HONORAIRES,
    default: TypeFacture.HONORAIRES,
  })
  @IsEnum(TypeFacture)
  type: TypeFacture = TypeFacture.HONORAIRES;

  @ApiProperty({
    description: 'Numéro unique de la facture',
    example: 'FAC-2025-001',
    default: 'FAC-2025-001',
  })
  @IsString()
  numero: string = 'FAC-2025-001';

  @ApiProperty({
    description: 'Date de création de la facture',
    example: '2025-10-28',
    default: new Date(),
  })
  @IsDate()
  @Type(() => Date)
  dateFacture: Date = new Date();

  @ApiProperty({
    description: 'Date limite de paiement (échéance)',
    example: '2025-11-28',
    default: new Date(new Date().setDate(new Date().getDate() + 30)),
  })
  @IsDate()
  @Type(() => Date)
  dateEcheance: Date = new Date(new Date().setDate(new Date().getDate() + 30));

  @ApiProperty({
    description: 'Montant hors taxes (HT)',
    example: 100000,
    default: 100000,
  })
  @IsNumber()
  montantHT: number = 100000;

  @ApiProperty({
    description: 'Taux de TVA en pourcentage',
    example: 20,
    default: 20,
  })
  @IsNumber()
  tauxTVA: number = 20;

  @ApiProperty({
    description: 'Montant de la TVA',
    example: 20000,
    default: 20000,
  })
  @IsNumber()
  montantTVA: number = 20000;

  @ApiProperty({
    description: 'Montant TTC (total à payer)',
    example: 120000,
    default: 120000,
  })
  @IsNumber()
  montantTTC: number = 120000;

  @ApiPropertyOptional({
    description: 'Description détaillée des prestations ou services facturés',
    example: 'Rédaction de contrat commercial et suivi judiciaire',
    default: 'Rédaction de contrat commercial et suivi judiciaire',
  })
  @IsString()
  @IsOptional()
  description?: string = 'Rédaction de contrat commercial et suivi judiciaire';

  @ApiPropertyOptional({
    enum: StatutFacture,
    description: 'Statut actuel de la facture',
    example: StatutFacture.BROUILLON,
    default: StatutFacture.BROUILLON,
  })
  @IsEnum(StatutFacture)
  @IsOptional()
  statut?: StatutFacture = StatutFacture.BROUILLON;

  @ApiPropertyOptional({
    description: 'Notes internes visibles uniquement par le cabinet',
    example: 'Acompte sur honoraires, solde prévu fin de procédure',
    default: 'Acompte sur honoraires, solde prévu fin de procédure',
  })
  @IsString()
  @IsOptional()
  notesInternes?: string = 'Acompte sur honoraires, solde prévu fin de procédure';
}
