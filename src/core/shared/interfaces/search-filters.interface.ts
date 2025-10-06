import { DossierStatus } from "src/core/enums/dossier-status.enum";
import { ProcedureType } from "src/core/enums/procedure-type.enum";

export interface SearchFilters {
  query?: string;
  procedureType?: ProcedureType;
  dossierStatus?: DossierStatus;
  clientId?: string;
  avocatId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}