// src/modules/customer/customer/dto/customer-response.dto.ts
import { Expose, Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

import { CustomerStatus, CustomerCreatedFrom } from "../entities/customer.entity";


export class CustomerResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "DUPONT" })
  @Expose()
  last_name: string;

  @ApiProperty({ example: "Pierre" })
  @Expose()
  first_name: string;

  @ApiProperty({ example: "DUPONT Pierre", description: "Nom complet du client" })
  @Expose()
  @Transform(({ obj }) => obj.full_name)
  full_name: string;

  @ApiProperty({ example: "SARL Entreprise ABC", required: false })
  @Expose()
  company_name?: string;

  @ApiProperty({ example: "123 Avenue de la République, 75001 Paris", required: false })
  @Expose()
  address?: string;

  @ApiProperty({ example: "75001", required: false })
  @Expose()
  postal_code?: string;

  @ApiProperty({ example: "France", required: false })
  @Expose()
  country?: string;

  @ApiProperty({ example: "forfait", description: "Type de facturation", required: false })
  @Expose()
  billing_type?: string;

  @ApiProperty({ example: "+33 1 45 67 89 00", required: false })
  @Expose()
  professional_phone?: string;

  @ApiProperty({ example: "+33 1 45 67 89 01", required: false })
  @Expose()
  fax?: string;

  @ApiProperty({ example: "12345678901234", required: false })
  @Expose()
  siret?: string;

  @ApiProperty({ example: "FR12345678901", required: false })
  @Expose()
  tva_number?: string;

  @ApiProperty({ example: "SARL", required: false })
  @Expose()
  legal_form?: string;

  @ApiProperty({ example: "Recommandation", description: "Comment le client a connu le cabinet", required: false })
  @Expose()
  reference?: string;

  @ApiProperty({ example: "+237 6 99 00 00 00", required: false })
  @Expose()
  number_phone_1?: string;

  @ApiProperty({ example: "+237 6 99 00 00 01", required: false })
  @Expose()
  number_phone_2?: string;

  @ApiProperty({ example: "contact@entreprise.cm" })
  @Expose()
  email: string;

  @ApiProperty({ example: "CLI-2025-001" })
  @Expose()
  customer_code: string;

  @ApiProperty({ example: CustomerStatus.ACTIVE, enum: CustomerStatus })
  @Expose()
  status: CustomerStatus;

  @ApiProperty({ example: "1980-05-15", required: false })
  @Expose()
  birthday?: Date;

  @ApiProperty({ example: "123456789", required: false })
  @Expose()
  nui?: string;

  @ApiProperty({ example: "RCCM-CM-2025A12345", required: false })
  @Expose()
  rccm?: string;

  @ApiProperty({ example: CustomerCreatedFrom.AGENCY, enum: CustomerCreatedFrom })
  @Expose()
  created_from: CustomerCreatedFrom;

  @ApiProperty({ example: 85, description: "Cote du client" })
  @Expose()
  cote: number;

  @ApiProperty({ example: "2025-01-15T08:00:00Z" })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: "2025-04-10T10:00:00Z" })
  @Expose()
  updated_at: Date;

  // ---------------- AGENCE ----------------
  @ApiProperty({
    example: {
      id: 1,
      name: "Cabinet Principal",
      code: "CP001",
      address: "123 Avenue Foch, 75016 Paris"
    },
    required: false
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.branch) return undefined;
    return {
      id: obj.branch.id,
      name: obj.branch.name,
      code: obj.branch.code,
      address: obj.branch.address
    };
  })
  branch?: {
    id: number;
    name: string;
    code: string;
    address?: string;
  };

  // ---------------- TYPE DE CLIENT ----------------
  @ApiProperty({
    example: {
      id: 1,
      name: "Professionnel",
      code: "PRO",
      description: "Clients professionnels et entreprises"
    }
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.type_customer) return undefined;
    return {
      id: obj.type_customer.id,
      name: obj.type_customer.name,
      code: obj.type_customer.code,
      description: obj.type_customer.description
    };
  })
  type_customer: {
    id: number;
    name: string;
    code: string;
    description?: string;
  };

  // ---------------- VILLE ----------------
  @ApiProperty({
    example: {
      id: 1,
      name: "Douala",
      region: "Littoral",
      country: "Cameroun"
    },
    required: false
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.location_city) return undefined;
    return {
      id: obj.location_city.id,
      name: obj.location_city.name,
      region: obj.location_city.region,
      country: obj.location_city.country
    };
  })
  location_city?: {
    id: number;
    name: string;
    region?: string;
    country?: string;
  };

  // ---------------- DOSSIERS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 1,
        dossier_number: "DOS-2025-001",
        object: "Litige commercial",
        status: "litigation",
        opening_date: "2025-01-15"
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dossiers) return undefined;
    return obj.dossiers.map((dossier: any) => ({
      id: dossier.id,
      dossier_number: dossier.dossier_number,
      object: dossier.object,
      status: dossier.status,
      opening_date: dossier.opening_date,
      is_active: dossier.is_active
    }));
  })
  dossiers?: {
    id: number;
    dossier_number: string;
    object: string;
    status: string;
    opening_date: Date;
    is_active: boolean;
  }[];

  // ---------------- COMPTAGES ----------------
  @ApiProperty({ example: 3, description: "Nombre total de dossiers" })
  @Expose()
  @Transform(({ obj }) => obj.dossiers?.length || 0)
  dossier_count: number;

  @ApiProperty({ example: 2, description: "Nombre de dossiers actifs" })
  @Expose()
  @Transform(({ obj }) => obj.dossiers?.filter((d: any) => d.is_active).length || 0)
  active_dossier_count: number;

  @ApiProperty({ example: 1, description: "Nombre de prêts" })
  @Expose()
  @Transform(({ obj }) => obj.loans?.length || 0)
  loan_count: number;

  @ApiProperty({ example: 2, description: "Nombre de comptes d'épargne" })
  @Expose()
  @Transform(({ obj }) => obj.savings_accounts?.length || 0)
  savings_account_count: number;

  // ---------------- ÉTATS LOGIQUES ----------------
  @ApiProperty({ example: true, description: "Le client est-il actif ?" })
  @Expose()
  @Transform(({ obj }) => obj.status === CustomerStatus.ACTIVE)
  is_active: boolean;

  @ApiProperty({ example: false, description: "Le client est-il un professionnel ?" })
  @Expose()
  @Transform(({ obj }) => obj.isProfessional)
  is_professional: boolean;

  @ApiProperty({ example: true, description: "Le client est-il un particulier ?" })
  @Expose()
  @Transform(({ obj }) => obj.isParticulier)
  is_particulier: boolean;

  @ApiProperty({ example: true, description: "Le client a-t-il des contacts valides ?" })
  @Expose()
  @Transform(({ obj }) => obj.hasValidContact)
  has_valid_contact: boolean;

  @ApiProperty({ example: true, description: "Le client peut-il être contacté ?" })
  @Expose()
  @Transform(({ obj }) => 
    obj.status === CustomerStatus.ACTIVE && 
    (obj.email || obj.number_phone_1 || obj.professional_phone)
  )
  can_be_contacted: boolean;

  // ---------------- STATISTIQUES FINANCIÈRES ----------------
  @ApiProperty({ 
    example: 750000, 
    description: "Montant total des factures des dossiers du client" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dossiers) return 0;
    return obj.dossiers.reduce((total: number, dossier: any) => {
      if (!dossier.factures) return total;
      return total + dossier.factures.reduce((factureTotal: number, facture: any) => 
        factureTotal + parseFloat(facture.amount_ttc?.toString() || '0'), 0);
    }, 0);
  })
  total_factures_amount: number;

  @ApiProperty({ 
    example: 500000, 
    description: "Montant payé sur les factures des dossiers du client" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dossiers) return 0;
    return obj.dossiers.reduce((total: number, dossier: any) => {
      if (!dossier.factures) return total;
      return total + dossier.factures
        .filter((facture: any) => facture.is_paid)
        .reduce((factureTotal: number, facture: any) => 
          factureTotal + parseFloat(facture.amount_ttc?.toString() || '0'), 0);
    }, 0);
  })
  paid_factures_amount: number;

  @ApiProperty({ 
    example: 250000, 
    description: "Solde restant à payer sur les factures du client" 
  })
  @Expose()
  @Transform(({ obj }) => obj.total_factures_amount - obj.paid_factures_amount)
  outstanding_balance: number;
}