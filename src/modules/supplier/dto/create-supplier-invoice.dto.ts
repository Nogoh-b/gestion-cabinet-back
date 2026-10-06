import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierInvoiceStatus } from '../entities/supplier-invoice.entity';
import { ExpenseRebillingType } from '../entities/expense-line.entity';

export class CreateSupplierInvoiceDto {
  @ApiProperty({
    example: 1,
    description: 'ID du fournisseur',
  })
  @IsInt()
  @IsNotEmpty()
  supplier_id: number;

  @ApiPropertyOptional({ description: 'Dossier client associé lorsque la dépense est refacturable' })
  @IsInt()
  @IsOptional()
  dossier_id?: number;

  @ApiPropertyOptional({ description: 'Action du dossier à l’origine de la dépense' })
  @IsUUID()
  @IsOptional()
  action_id?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  is_rebillable?: boolean;

  @ApiPropertyOptional({ enum: ExpenseRebillingType, default: ExpenseRebillingType.EXPENSE })
  @IsEnum(ExpenseRebillingType)
  @IsOptional()
  rebilling_type?: ExpenseRebillingType;

  @ApiPropertyOptional({ example: 'XAF', default: 'XAF' })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  currency?: string;

  @ApiProperty({
    example: 'FAC-2026-0452',
    description:
      'Numéro de facture fournisseur. Généré automatiquement si non fourni.',
    required: false,
  })
  @IsOptional()
  @IsString()
  invoice_number?: string;

  @ApiPropertyOptional({
    example: 'Abonnement internet fibre - Mars 2026',
    description: 'Objet de la facture',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: '2026-03-15',
    description: "Date d'émission",
  })
  @IsDateString()
  @IsNotEmpty()
  invoice_date: Date;

  @ApiProperty({
    example: '2026-04-15',
    description: "Date d'échéance",
  })
  @IsDateString()
  @IsNotEmpty()
  due_date: Date;

  @ApiProperty({
    example: 150.0,
    description: 'Montant HT',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount_ht: number;

  @ApiProperty({
    example: 20.0,
    description: 'Taux TVA (%)',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  tax_rate: number;

  @ApiProperty({
    example: 30.0,
    description: 'Montant TVA',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount_tva: number;

  @ApiProperty({
    example: 180.0,
    description: 'Montant TTC',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount_ttc: number;

  @ApiPropertyOptional({
    enum: SupplierInvoiceStatus,
    example: SupplierInvoiceStatus.RECEIVED,
    description: 'Statut initial',
  })
  @IsEnum(SupplierInvoiceStatus)
  @IsOptional()
  status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({
    example: 'https://storage.cabinet.fr/factures/fac-2026-0452.pdf',
    description: 'Lien vers la facture scannée',
  })
  @IsString()
  @IsOptional()
  attachment_url?: string;

  @ApiPropertyOptional({
    example: 2,
    description: "ID de l'agence",
  })
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({
    example: 'Paiement à valider',
    description: 'Notes internes',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
