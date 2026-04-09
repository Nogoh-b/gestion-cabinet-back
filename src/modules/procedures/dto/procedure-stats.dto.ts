// src/modules/procedures/dto/procedure-stats.dto.ts
export class ProcedureStatsDto {
  total: number;
  mainTypes: number;
  subTypes: number;
  active: number;
  
  byCategory: ProcedureCategoryDto[];
  mostUsed: MostUsedProcedureDto[];
}

export class ProcedureCategoryDto {
  category: string;
  count: number;
  subtypes: number;
  dossiers: number;
}

export class MostUsedProcedureDto {
  id: number;
  name: string;
  code: string;
  dossiersCount: number;
  isSubtype: boolean;
  parentName?: string;
}