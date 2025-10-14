// src/modules/customer/type-customer/dto/type-customer-response.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { Expose, Transform } from "class-transformer";

export class TypeCustomerResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "Professionnel" })
  @Expose()
  name: string;

  @ApiProperty({ example: "PRO" })
  @Expose()
  code: string;

  @ApiProperty({ example: 1 })
  @Expose()
  status: number;

  @ApiProperty({ example: "2025-01-15T08:00:00Z" })
  @Expose()
  @Transform(({ obj }) => obj.create_at)
  created_at: Date;

  @ApiProperty({ example: "2025-04-10T10:00:00Z" })
  @Expose()
  @Transform(({ obj }) => obj.update_at)
  updated_at: Date;

  // ---------------- DOCUMENTS REQUIS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 1,
        name: "KBIS",
        code: "KBIS",
        description: "Extrait Kbis"
      },
      {
        id: 2,
        name: "Statuts",
        code: "STATUTS",
        description: "Statuts de la société"
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.requiredDocuments) return undefined;
    return obj.requiredDocuments.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      code: doc.code,
      description: doc.description
    }));
  })
  required_documents?: {
    id: number;
    name: string;
    code: string;
    description?: string;
  }[];

  // ---------------- CLIENTS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 1,
        full_name: "Société ABC SARL",
        customer_code: "CLI-2025-001",
        email: "contact@abc.cm"
      }
    ]
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.customers) return undefined;
    return obj.customers.map((customer: any) => ({
      id: customer.id,
      full_name: customer.full_name,
      customer_code: customer.customer_code,
      email: customer.email,
      company_name: customer.company_name
    }));
  })
  customers?: {
    id: number;
    full_name: string;
    customer_code: string;
    email: string;
    company_name?: string;
  }[];

  // ---------------- COMPTAGES ----------------
  @ApiProperty({ example: 25, description: "Nombre total de clients de ce type" })
  @Expose()
  @Transform(({ obj }) => obj.customers?.length || 0)
  customer_count: number;

  @ApiProperty({ example: 5, description: "Nombre de documents requis pour ce type" })
  @Expose()
  @Transform(({ obj }) => obj.requiredDocuments?.length || 0)
  required_document_count: number;

  @ApiProperty({ example: 20, description: "Nombre de clients actifs de ce type" })
  @Expose()
  @Transform(({ obj }) => obj.customers?.filter((c: any) => c.status === 1).length || 0)
  active_customer_count: number;

  // ---------------- ÉTATS LOGIQUES ----------------
  @ApiProperty({ example: true, description: "Le type de client est-il actif ?" })
  @Expose()
  @Transform(({ obj }) => obj.status === 1)
  is_active: boolean;

  @ApiProperty({ example: false, description: "Le type de client est-il un type professionnel ?" })
  @Expose()
  @Transform(({ obj }) => obj.code?.includes('PRO') || obj.name?.toLowerCase().includes('professionnel') || obj.name?.toLowerCase().includes('entreprise'))
  is_professional: boolean;

  @ApiProperty({ example: true, description: "Le type de client est-il un type particulier ?" })
  @Expose()
  @Transform(({ obj }) => obj.code?.includes('PART') || obj.name?.toLowerCase().includes('particulier') || obj.name?.toLowerCase().includes('individuel'))
  is_particulier: boolean;

  @ApiProperty({ example: true, description: "Le type de client a-t-il des documents requis ?" })
  @Expose()
  @Transform(({ obj }) => (obj.requiredDocuments?.length || 0) > 0)
  has_required_documents: boolean;

  // ---------------- STATISTIQUES AVANCÉES ----------------
  @ApiProperty({ 
    example: 15, 
    description: "Nombre de dossiers ouverts pour ce type de client" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.customers) return 0;
    return obj.customers.reduce((total: number, customer: any) => {
      return total + (customer.dossiers?.filter((d: any) => d.is_active).length || 0);
    }, 0);
  })
  active_dossier_count: number;

  @ApiProperty({ 
    example: 5000000, 
    description: "Chiffre d'affaires total pour ce type de client" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.customers) return 0;
    return obj.customers.reduce((total: number, customer: any) => {
      if (!customer.dossiers) return total;
      return total + customer.dossiers.reduce((dossierTotal: number, dossier: any) => {
        if (!dossier.factures) return dossierTotal;
        return dossierTotal + dossier.factures.reduce((factureTotal: number, facture: any) => 
          factureTotal + parseFloat(facture.amount_ttc?.toString() || '0'), 0);
      }, 0);
    }, 0);
  })
  total_revenue: number;

  @ApiProperty({ 
    example: 75, 
    description: "Taux d'activité moyen des clients de ce type (%)" 
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.customers || obj.customers.length === 0) return 0;
    const totalCustomers = obj.customers.length;
    const activeCustomers = obj.customers.filter((c: any) => c.status === 1).length;
    return Math.round((activeCustomers / totalCustomers) * 100);
  })
  activity_rate: number;
}

// DTO pour les réponses liste (version simplifiée)
export class TypeCustomerListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "Professionnel" })
  @Expose()
  name: string;

  @ApiProperty({ example: "PRO" })
  @Expose()
  code: string;

  @ApiProperty({ example: 1 })
  @Expose()
  status: number;

  @ApiProperty({ example: 25 })
  @Expose()
  @Transform(({ obj }) => obj.customers?.length || 0)
  customer_count: number;

  @ApiProperty({ example: 5 })
  @Expose()
  @Transform(({ obj }) => obj.requiredDocuments?.length || 0)
  required_document_count: number;

  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => obj.status === 1)
  is_active: boolean;

  @ApiProperty({ example: "2025-01-15T08:00:00Z" })
  @Expose()
  @Transform(({ obj }) => obj.create_at)
  created_at: Date;
}