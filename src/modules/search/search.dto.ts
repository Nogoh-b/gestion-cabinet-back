import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GlobalSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q = '';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export const SEARCH_TYPES = [
  'dossiers',
  'clients',
  'documents',
  'audiences',
  'factures',
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchDossier {
  id: number;
  number: string;
  object: string | null;
  client: string;
}

export interface GlobalSearchResult {
  id: string | number;
  type: SearchType;
  title: string;
  subtitle?: string;
  description?: string;
  href: string;
  dossiers: SearchDossier[];
}

export interface SearchUser {
  tenantId: number;
  role: string;
  permissions: string[];
}
