import { ApiProperty } from "@nestjs/swagger";
import { DossierStatus } from "src/core/enums/dossier-status.enum";
import { AudienceStatus } from "src/modules/audiences/entities/audience.entity";
import { FactureStatus } from "src/modules/finances/entities/facture.entity";
import { DocumentCategory, DocumentCustomerStatus } from "src/modules/documents/document-customer/entities/document-customer.entity";

export class DossierResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: "DOS-2025-001" })
  dossier_number: string;

  @ApiProperty({ example: "Litige commercial contre Société X" })
  object: string;

  @ApiProperty({ example: "Tribunal de Commerce de Douala" })
  jurisdiction: string;

  @ApiProperty({ example: "Chambre civile", required: false })
  court_name?: string;

  @ApiProperty({ example: "RC/12345/2025", required: false })
  case_number?: string;

  @ApiProperty({ example: "Société X", required: false })
  opposing_party_name?: string;

  @ApiProperty({ example: "Me TCHOUA", required: false })
  opposing_party_lawyer?: string;

  @ApiProperty({ example: "contact@societex.cm", required: false })
  opposing_party_contact?: string;

  @ApiProperty({ example: "Tiers associés au litige", required: false })
  third_parties?: string;

  @ApiProperty({ example: "Litige sur non-exécution de contrat de prestation." })
  description?: string;

  @ApiProperty({ example: DossierStatus.LITIGATION, enum: DossierStatus })
  status: DossierStatus;

  @ApiProperty({ example: "2025-01-15" })
  opening_date: Date;

  @ApiProperty({ example: "2025-09-30", required: false })
  closing_date?: Date;

  @ApiProperty({ example: 180, required: false })
  estimated_duration?: number;

  @ApiProperty({ example: "confidentiel" })
  confidentiality_level: string;

  @ApiProperty({ example: 2, description: "Niveau de priorité (0=normal, 3=urgent)" })
  priority_level: number;

  @ApiProperty({ example: 250000 })
  budget_estimate?: number;

  @ApiProperty({ example: 230000 })
  actual_costs: number;

  @ApiProperty({ example: 80 })
  success_probability?: number;

  @ApiProperty({
    example: [
      { event: "Première audience", date: "2025-03-12", completed: false },
    ],
  })
  key_dates?: { event: string; date: string; completed: boolean }[];

  @ApiProperty({ example: "Préparer conclusions avant audience du 12/03" })
  next_steps?: string;

  @ApiProperty({ example: "Décision favorable au client", required: false })
  final_decision?: string;

  @ApiProperty({ example: true })
  appeal_possibility: boolean;

  @ApiProperty({ example: "2025-12-01", required: false })
  appeal_deadline?: Date;

  @ApiProperty({ example: "2025-01-15T08:00:00Z" })
  created_at: Date;

  @ApiProperty({ example: "2025-04-10T10:00:00Z" })
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
  client: {
    id: number;
    full_name: string;
    email: string;
    company_name?: string;
    billing_type?: string;
    professional_phone?: string;
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
  procedure_type: { id: number; name: string; code: string; description?: string };

  @ApiProperty({
    example: { id: 2, name: "Contentieux Commercial", code: "CIV-COM" },
  })
  procedure_subtype: { id: number; name: string; code: string };

  // ---------------- DOCUMENTS ----------------
  @ApiProperty({
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
  })
  documents?: {
    id: number;
    name: string;
    category: DocumentCategory;
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
        status: FactureStatus.PAID,
        remaining_amount: 0,
        is_paid: true,
      },
    ],
  })
  factures?: {
    id: string;
    invoice_number: string;
    invoice_date: Date;
    due_date: Date;
    amount_ttc: number;
    status: FactureStatus;
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
  collaborators?: {
    id: number;
    full_name: string;
    email: string;
    role: string;
  }[];

  // ---------------- COMPTAGES ----------------
  @ApiProperty({ example: 8 })
  document_count: number;

  @ApiProperty({ example: 3 })
  audience_count: number;

  @ApiProperty({ example: 2 })
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
  next_audience?: {
    id: number;
    audience_date: Date;
    audience_time: string;
    jurisdiction: string;
    room?: string;
  } | null;

  // ---------------- MONTANTS TOTAUX ----------------
  @ApiProperty({ example: 300000 })
  total_factures_amount?: number;

  @ApiProperty({ example: 250000 })
  paid_factures_amount?: number;

  // ---------------- ÉTATS LOGIQUES ----------------
  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: false })
  is_closed: boolean;

  @ApiProperty({ example: false })
  is_archived: boolean;



  
}
