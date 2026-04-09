// create-customer.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsInt,
  IsEmail,
  IsDate,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEnum
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CustomerCreatedFrom, CustomerStatus } from '../entities/customer.entity';
import { CommunicationStatus, CommunicationType } from '../entities/customer-communication.entity';


export class CreateCustomerDto {
  @IsString()
  @MaxLength(45)
  @IsNotEmpty()
  @ApiProperty({ example: 'John', description: 'Customer first name' })
  first_name: string;

  @IsString()
  @MaxLength(45)
  @IsNotEmpty()
  @ApiProperty({ example: 'Doe', description: 'Customer last name' })
  last_name: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  @ApiPropertyOptional({ example: 'Entreprise SARL', description: 'Company name' })
  company_name?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: '123 Rue de la République', description: 'Complete address' })
  address?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  @ApiPropertyOptional({ example: '75001', description: 'Postal code' })
  postal_code?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'France', description: 'Country', default: 'France' })
  country?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: 'forfait', 
    description: 'Billing type: forfait, temps_passe, mixte' 
  })
  billing_type?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+33123456789', description: 'Professional phone number' })
  professional_phone?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+33123456780', description: 'Fax number' })
  fax?: string;

  @IsString()
  @MaxLength(14)
  @IsOptional()
  @ApiPropertyOptional({ example: '12345678901234', description: 'SIRET number' })
  siret?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  @ApiPropertyOptional({ example: 'FR12345678901', description: 'TVA number' })
  tva_number?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'SARL', description: 'Legal form: SARL, SAS, EI, etc.' })
  legal_form?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'Recommandation', description: 'How the client found us' })
  reference?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+216 55 55 55 55', description: 'Primary phone number' })
  number_phone_1?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+216 55 55 55 56', description: 'Secondary phone number' })
  number_phone_2?: string;

  @IsEmail()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: 'john.doe@gmail.com', description: 'Email address' })
  email?: string;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Branch identifier' })
  branch_id: number;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Location city identifier' })
  location_city_id: number;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Customer type identifier' })
  type_customer_id: number;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: '00000000000000000',
    description: 'National Unique Identifier' 
  })
  nui?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: '00000000000000000',
    description: 'RCCM number' 
  })
  rccm?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiPropertyOptional({ example: '1990-01-01', description: 'Birth date' })
  birthday?: Date;

  @IsEnum(CustomerCreatedFrom)
  @IsOptional()
  @ApiPropertyOptional({ 
    enum: CustomerCreatedFrom,
    example: CustomerCreatedFrom.AGENCY,
    description: 'How the customer was created' 
  })
  created_from?: CustomerCreatedFrom;

  @IsEnum(CustomerStatus)
  @IsOptional()
  @ApiPropertyOptional({ 
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
    description: 'Customer status' 
  })
  status?: CustomerStatus;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Customer code (auto-generated if not provided)' })
  customer_code?: string;
 // ---------------- COMMUNICATIONS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 1,
        type: 'email',
        subject: 'Confirmation de rendez-vous',
        date: '2024-01-15T10:30:00Z',
        status: 'sent',
        content: 'Bonjour, je confirme notre rendez-vous...'
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.communications) return undefined;
    return obj.communications.map((comm: any) => ({
      id: comm.id,
      type: comm.type,
      subject: comm.subject,
      date: comm.date,
      status: comm.status,
      content: comm.content,
      duration: comm.duration
    }));
  })
  communications?: {
    id: number;
    type: CommunicationType;
    subject: string;
    date: Date;
    status: CommunicationStatus;
    content?: string;
    duration?: number;
  }[];

  // ---------------- DOCUMENTS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 1,
        name: 'contrat_signature.pdf',
        document_type_name: 'Contrat',
        created_at: '2024-01-15',
        file_size_formatted: '2.4 MB'
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.documents) return undefined;
    return obj.documents.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      document_type_name: doc.document_type?.name || 'Document',
      created_at: doc.created_at,
      file_size_formatted: doc.file_size_formatted || '0 KB'
    }));
  })
  documents?: {
    id: number;
    name: string;
    document_type_name: string;
    created_at: Date;
    file_size_formatted: string;
  }[];

  // ---------------- STATISTIQUES AMÉLIORÉES ----------------
  @ApiProperty({ example: 5, description: "Nombre total de documents" })
  @Expose()
  @Transform(({ obj }) => obj.documents?.length || 0)
  document_count: number;

  @ApiProperty({ example: 3, description: "Nombre de communications" })
  @Expose()
  @Transform(({ obj }) => obj.communications?.length || 0)
  communication_count: number;

  // ---------------- INFORMATIONS DE CONTACT COMPLÈTES ----------------
  @ApiProperty({ 
    example: "M", 
    description: "Civilité du client",
    required: false 
  })
  @Expose()
  civilite?: string; // Vous devrez ajouter ce champ dans l'entité

  @ApiProperty({ 
    example: "1985-05-15", 
    description: "Date de naissance",
    required: false 
  })

  // ---------------- CALCULS DE STATISTIQUES ----------------
  @ApiProperty({ 
    example: 2, 
    description: "Nombre de dossiers en cours" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dossiers) return 0;
    return obj.dossiers.filter((d: any) => 
      d.status !== 'closed' && d.is_active
    ).length;
  })
  dossiers_en_cours: number;

  @ApiProperty({ 
    example: 12500, 
    description: "Chiffre d'affaires total" 
  })
  @Expose()
  @Transform(({ obj }) => obj.total_factures_amount || 0)
  chiffre_affaires: number;

  @ApiProperty({ 
    example: 5700, 
    description: "Solde en cours" 
  })
  @Expose()
  @Transform(({ obj }) => obj.outstanding_balance || 0)
  solde_en_cours: number;
  // Note: public_key and private_key are auto-generated and should not be in DTO
}