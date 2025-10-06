// src/modules/dossiers/dto/dossier-response.dto.ts
import { DossierStatus } from "src/core/enums/dossier-status.enum";

export class DossierResponseDto {
  id: string;
  dossier_number: string;
  object: string;
  jurisdiction: string;
  court_name?: string;
  case_number?: string;
  opposing_party_name?: string;
  description?: string;
  status: DossierStatus;
  opening_date: Date;
  closing_date?: Date;
  estimated_duration?: number;
  confidentiality_level: string;
  priority_level: string;
  budget_estimate?: number;
  actual_costs: number;
  success_probability?: number;
  final_decision?: string;
  appeal_possibility: boolean;
  appeal_deadline?: Date;
  created_at: Date;
  updated_at: Date;

  // Relations
  client: {
    id: string;
    full_name: string;
    email: string;
    company_name?: string;
  };

  lawyer: {
    id: string;
    full_name: string;
    email: string;
    specialization?: string;
    bar_association_number?: string;
  };

  procedure_type: {
    id: string;
    name: string;
    code: string;
  };

  procedure_subtype: {
    id: string;
    name: string;
    code: string;
  };

  // Tableaux de relations (optionnels dans la réponse)
  documents?: any[];
  audiences?: any[];
  factures?: any[];
  collaborators?: any[];
  // comments?: any[];

  // Counts
  document_count: number;
  audience_count: number;
  facture_count: number;

  // Computed
  next_audience?: {
    id: string;
    audience_date: Date;
    audience_time: string;
    jurisdiction: string;
  } | null;

  is_active: boolean;
  is_closed: boolean;
  is_archived: boolean;
}