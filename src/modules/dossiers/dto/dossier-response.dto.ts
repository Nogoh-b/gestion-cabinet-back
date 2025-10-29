// src/modules/dossiers/dto/dossier-response.dto.ts
import { Expose, Transform } from "class-transformer";
import { DossierStatus } from "src/core/enums/dossier-status.enum";
import { AudienceStatus } from "src/modules/audiences/entities/audience.entity";
import { DocumentCustomerStatus } from "src/modules/documents/document-customer/entities/document-customer.entity";
import { StatutFacture } from "src/modules/facture/dto/create-facture.dto";
import { ApiProperty } from "@nestjs/swagger";











export class DossierResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: "DOS-2025-001" })
  @Expose()
  dossier_number: string;

  @ApiProperty({ example: "Litige commercial contre Société X" })
  @Expose()
  object: string;

  @ApiProperty({ example: "Tribunal de Commerce de Douala" })
  @Expose()
  jurisdiction: string;

  @ApiProperty({ example: "Chambre civile", required: false })
  @Expose()
  court_name?: string;

  @ApiProperty({ example: "RC/12345/2025", required: false })
  @Expose()
  case_number?: string;

  @ApiProperty({ example: "Société X", required: false })
  @Expose()
  opposing_party_name?: string;

  @ApiProperty({ example: "Me TCHOUA", required: false })
  @Expose()
  opposing_party_lawyer?: string;

  @ApiProperty({ example: "contact@societex.cm", required: false })
  @Expose()
  opposing_party_contact?: string;

  @ApiProperty({ example: "Tiers associés au litige", required: false })
  @Expose()
  third_parties?: string;

  @ApiProperty({ example: "Litige sur non-exécution de contrat de prestation." })
  @Expose()
  description?: string;

  @ApiProperty({ example: DossierStatus.LITIGATION, enum: DossierStatus })
  @Expose()
  status: DossierStatus;

  @ApiProperty({ example: "2025-01-15" })
  @Expose()
  opening_date: Date;

  @ApiProperty({ example: "2025-09-30", required: false })
  @Expose()
  closing_date?: Date;

  @ApiProperty({ example: 180, required: false })
  @Expose()
  estimated_duration?: number;

  @ApiProperty({ example: "confidentiel" })
  @Expose()
  confidentiality_level: string;

  @ApiProperty({ example: 2, description: "Niveau de priorité (0=normal, 3=urgent)" })
  @Expose()
  priority_level: number;

  @ApiProperty({ example: 250000 })
  @Expose()
  budget_estimate?: number;

  @ApiProperty({ example: 230000 })
  @Expose()
  actual_costs: number;

  @ApiProperty({ example: 80 })
  @Expose()
  success_probability?: number;

  @ApiProperty({
    example: [
      { event: "Première audience", date: "2025-03-12", completed: false },
    ],
  })
  @Expose()
  key_dates?: { event: string; date: string; completed: boolean }[];

  @ApiProperty({ example: "Préparer conclusions avant audience du 12/03" })
  @Expose()
  next_steps?: string;

  @ApiProperty({ example: "Décision favorable au client", required: false })
  @Expose()
  final_decision?: string;

  @ApiProperty({ example: true })
  @Expose()
  appeal_possibility: boolean;

  @ApiProperty({ example: "2025-12-01", required: false })
  @Expose()
  appeal_deadline?: Date;

  @ApiProperty({ example: "2025-01-15T08:00:00Z" })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: "2025-04-10T10:00:00Z" })
  @Expose()
  updated_at: Date;

  // ---------------- CLIENT ----------------
  @ApiProperty({
    example: {
      id: 15,
      full_name: "Société ABC SARL",
      email: "contact@abc.cm",
      company_name: "ABC SARL",
      billing_type: "forfait",
      professional_phone: "+237 6 99 00 00 00",
    },
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.client) return undefined;
    return {
      id: obj.client.id,
      full_name: obj.client.full_name,
      email: obj.client.email,
      number_phone_1: obj.client.number_phone_1,
      adress: obj.client.city_full_address,
      company_name: obj.client.company_name,
      billing_type: obj.client.billing_type,
      professional_phone: obj.client.professional_phone,
    };
  })
  client: {
    id: number;
    full_name: string;
    email: string;
    company_name?: string;
    billing_type?: string;
    professional_phone?: string;
    adress?: string;
    number_phone_1?: string;
  };

  // ---------------- AVOCAT ----------------
  @ApiProperty({
    example: {
      id: 2,
      full_name: "Me Lionel NOGOH",
      email: "lionel.nogoh@cabinet.cm",
      specialization: "Droit commercial",
      bar_association_number: "BA12345",
    },
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.lawyer) return undefined;
    return {
      id: obj.lawyer.id,
      full_name: obj.lawyer.full_name,
      email: obj.lawyer.email,
      specialization: obj.lawyer.specialization,
      bar_association_number: obj.lawyer.bar_association_number,
    };
  })
  lawyer: {
    id: number;
    full_name: string;
    email: string;
    specialization?: string;
    bar_association_number?: string;
  };

  // ---------------- PROCÉDURE ----------------
  @ApiProperty({
    example: { id: 1, name: "Procédure Civile", code: "CIV001" },
  })
  @Expose()
  procedure_type: { id: number; name: string; code: string; description?: string };

  @ApiProperty({
    example: { id: 2, name: "Contentieux Commercial", code: "CIV-COM" },
  })
  @Expose()
  procedure_subtype: { id: number; name: string; code: string };

  // ---------------- DOCUMENTS ----------------
  /*@ApiProperty({
    type: [Object],
    example: [
      {
        id: 101,
        name: "Assignation.pdf",
        category: DocumentCategory.PROCEDURE,
        document_type: "Assignation",
        status: DocumentCustomerStatus.VALIDATED,
        version: 2,
        uploaded_by: "Me Lionel",
        created_at: "2025-01-20",
      },
    ],
  })*/
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.documents) return undefined;
    return obj.documents.map((doc: any) => ({
      id: doc.id,
      name: doc.name,
      category: doc.category,
      document_type: doc.document_type,
      status: doc.status,
      version: doc.version,
      uploaded_by: doc.uploaded_by,
      created_at: doc.created_at,
    }));
  })
  documents?: {
    id: number;
    name: string;
    // category: DocumentCategory;
    document_type: string;
    status: DocumentCustomerStatus;
    version: number;
    uploaded_by: string;
    created_at: Date;
  }[];

  // ---------------- AUDIENCES ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: 12,
        audience_date: "2025-03-12",
        audience_time: "09:00",
        jurisdiction: "TPI Douala-Bonanjo",
        status: AudienceStatus.SCHEDULED,
        decision: null,
        outcome: null,
        is_upcoming: true,
      },
    ],
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.audiences) return undefined;
    return obj.audiences.map((audience: any) => ({
      id: audience.id,
      audience_date: audience.audience_date,
      audience_time: audience.audience_time,
      jurisdiction: audience.jurisdiction,
      status: audience.status,
      judge_name: audience.judge_name,
      room: audience.room,
      type: audience.type,
      decision: audience.decision,
      outcome: audience.outcome,
      is_upcoming: audience.is_upcoming,
    }));
  })
  audiences?: {
    id: number;
    audience_date: Date;
    audience_time: string;
    jurisdiction: string;
    status: AudienceStatus;
    decision?: string;
    outcome?: string;
    is_upcoming: boolean;
  }[];

  // ---------------- FACTURES ----------------
  @ApiProperty({
    type: [Object],
    example: [
      {
        id: "FCT-2025-001",
        invoice_number: "INV-2025-001",
        invoice_date: "2025-01-25",
        due_date: "2025-02-25",
        amount_ttc: 150000,
        status: StatutFacture.PAYEE,
        remaining_amount: 0,
        is_paid: true,
      },
    ],
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.factures) return undefined;
    return obj.factures.map((facture: any) => ({
      id: facture.id,
      invoice_number: facture.invoice_number,
      invoice_date: facture.invoice_date,
      due_date: facture.due_date,
      amount_ttc: facture.amount_ttc,
      status: facture.status,
      remaining_amount: facture.remaining_amount,
      is_paid: facture.is_paid,
    }));
  })
  factures?: {
    id: string;
    invoice_number: string;
    invoice_date: Date;
    due_date: Date;
    amount_ttc: number;
    status: StatutFacture;
    remaining_amount: number;
    is_paid: boolean;
  }[];

  // ---------------- COLLABORATEURS ----------------
  @ApiProperty({
    type: [Object],
    example: [
      { id: 4, full_name: "Me Sophie ETOA", email: "sophie@cabinet.cm", role: "Secrétaire" },
    ],
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.collaborators) return undefined;
    return obj.collaborators.map((collab: any) => ({
      id: collab.id,
      full_name: collab.full_name,
      email: collab.email,
      role: collab.role,
    }));
  })
  collaborators?: {
    id: number;
    full_name: string;
    email: string;
    role: string;
  }[];

  // ---------------- COMPTAGES ----------------
  @ApiProperty({ example: 8 })
  @Expose()
  @Transform(({ obj }) => obj.documents?.length || 0)
  document_count: number;

  @ApiProperty({ example: 3 })
  @Expose()
  @Transform(({ obj }) => obj.audiences?.length || 0)
  audience_count: number;

  @ApiProperty({ example: 2 })
  @Expose()
  @Transform(({ obj }) => obj.factures?.length || 0)
  facture_count: number;

  // ---------------- PROCHAINE AUDIENCE ----------------
  @ApiProperty({
    example: {
      id: 12,
      audience_date: "2025-03-12",
      audience_time: "09:00",
      jurisdiction: "TPI Douala-Bonanjo",
      room: "Salle 3",
    },
    required: false,
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.audiences || obj.audiences.length === 0) return null;
    
    const upcoming = obj.audiences
      .filter((audience: any) => 
        audience.status === AudienceStatus.SCHEDULED && audience.is_upcoming
      )
      .sort((a: any, b: any) => 
        new Date(a.audience_date).getTime() - new Date(b.audience_date).getTime()
      );
    
    return upcoming.length > 0 ? {
      id: upcoming[0].id,
      audience_date: upcoming[0].audience_date,
      audience_time: upcoming[0].audience_time,
      jurisdiction: upcoming[0].jurisdiction,
      room: upcoming[0].room,
    } : null;
  })
  next_audience?: {
    id: number;
    audience_date: Date;
    audience_time: string;
    jurisdiction: string;
    room?: string;
  } | null;

  // ---------------- MONTANTS TOTAUX ----------------
  @ApiProperty({ example: 300000 })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.factures) return 0;
    return obj.factures.reduce((total: number, facture: any) => 
      total + parseFloat(facture.amount_ttc?.toString() || '0'), 0);
  })
  total_factures_amount: number;

  @ApiProperty({ example: 250000 })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.factures) return 0;
    return obj.factures
      .filter((facture: any) => facture.status === StatutFacture.PAYEE)
      .reduce((total: number, facture: any) => 
        total + parseFloat(facture.amount_ttc?.toString() || '0'), 0);
  })
  paid_factures_amount: number;

  // ---------------- ÉTATS LOGIQUES ----------------
  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => {
    const isClosed = obj.status === DossierStatus.CLOSED || obj.status === DossierStatus.ARCHIVED;
    const isArchived = obj.status === DossierStatus.ARCHIVED;
    return !isClosed && !isArchived;
  })
  is_active: boolean;

  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => 
    obj.status === DossierStatus.CLOSED || obj.status === DossierStatus.ARCHIVED
  )
  is_closed: boolean;

  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => obj.status === DossierStatus.ARCHIVED)
  is_archived: boolean;
}