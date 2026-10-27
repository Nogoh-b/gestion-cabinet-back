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

/** `GET /search/mentions` : recherche « partout » du menu @ du chat IA. */
export class MentionSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q = '';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 3;
}

/** Mêmes clés que les catégories du menu @ (`mentionConfigs` du front). */
export const MENTION_TYPES = [
  'client',
  'dossier',
  'employee',
  'diligence',
  'audience',
  'facture',
  'document',
  'fournisseur',
  'apporteur',
  'modele_document',
  'modele_mail',
] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

export interface MentionItem {
  id: number | string;
  label: string;
  sublabel?: string;
  /** Repères joints au contexte de la question (numéro, e-mail, date…). */
  data: Record<string, unknown>;
}

export interface MentionGroup {
  type: MentionType;
  items: MentionItem[];
  /** D'autres résultats existent : le menu propose « Voir tout ». */
  hasMore: boolean;
}
