// src/paiement/dto/create-paiement.dto.ts
import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDate, IsEnum, IsBoolean, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


export enum ModePaiement {
  VIREMENT = 0,
  CHEQUE = 1,
  ESPECES = 2,
  CARTE = 3,
  PRELEVEMENT = 4,
  Mobile = 5,
  AUTRE = 6
}

export enum StatutPaiement {
  EN_ATTENTE = 0,
  VALIDE = 1,
  REJETE = 2,
  ANNULE = 3
}
 
export class CreatePaiementDto {
  @ApiProperty({
    description: 'ID de la facture associée',
    example: 101,
  })
  @IsString()
  factureId: string;

  @ApiProperty({
    description: 'Montant du paiement',
    example: 150000,
    default: 0,
  })
  @IsNumber()
  @IsPositive()
  montant: number = 0;

  @ApiProperty({
    enum: ModePaiement,
    description: 'Mode de paiement',
    example: ModePaiement.VIREMENT,
    default: ModePaiement.VIREMENT,
  })
  @IsEnum(ModePaiement)
  modePaiement: ModePaiement = ModePaiement.VIREMENT;

  @ApiProperty({
    description: 'Date du paiement',
    example: '2025-10-28',
    default: new Date(),
  })
  @IsDate()
  @Type(() => Date)
  datePaiement: Date = new Date();

  @ApiProperty({
    description: 'Date de valeur du paiement',
    example: '2025-10-28',
    default: new Date(),
  })
  @IsDate()
  @Type(() => Date)
  dateValeur: Date = new Date();

  @ApiPropertyOptional({
    description: 'Référence du paiement',
    example: 'PAY-2025-001',
    default: 'PAY-REF-001',
  })
  @IsString()
  @IsOptional()
  reference?: string = 'PAY-REF-001';

  @ApiPropertyOptional({
    description: 'Numéro de chèque (si applicable)',
    example: 'CHQ123456',
    default: '',
  })
  @IsString()
  @IsOptional()
  numeroCheque?: string = '';

  @ApiPropertyOptional({
    description: 'Banque émettrice',
    example: 'Banque Atlantique',
    default: 'Banque Atlantique',
  })
  @IsString()
  @IsOptional()
  banque?: string = 'Banque Atlantique';

  @ApiPropertyOptional({
    description: 'Titulaire du compte ou de la carte',
    example: 'John Doe',
    default: 'John Doe',
  })
  @IsString()
  @IsOptional()
  titulaire?: string = 'John Doe';

  @ApiPropertyOptional({
    description: 'Notes internes ou commentaire du paiement',
    example: 'Acompte sur honoraires',
    default: 'Acompte sur honoraires',
  })
  @IsString()
  @IsOptional()
  notes?: string = 'Acompte sur honoraires';

  /**
   * Transient — case « Notifier le client » du modal.
   * Lue par le PaiementSubscriber pour envoyer un reçu par e-mail au client.
   */
  @ApiPropertyOptional({
    description: 'Envoyer un reçu de paiement au client par e-mail',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  notify_client?: boolean;
}
