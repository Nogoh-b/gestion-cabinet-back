// src/modules/jurisdiction/dto/jurisdiction-stats.dto.ts

import { DistributionItem } from "src/core/types/base-stats.dto";

export class JurisdictionStatsDto {
  total: number;
  active: number;
  byLevel: DistributionItem[];
  byType: DistributionItem[];
  topJurisdictions: TopJurisdictionDto[];
}

export class TopJurisdictionDto {
  id: number;
  name: string;
  city: string;
  audiencesCount: number;
  dossiersCount: number;
}

// Ajouter un DTO pour les filtres
export class JurisdictionStatsFiltersDto {
  startDate?: Date;
  endDate?: Date;
}