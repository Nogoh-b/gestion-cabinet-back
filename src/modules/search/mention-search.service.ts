import { Injectable, Logger } from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { CustomersService } from '../customer/customer/customer.service';
import { CustomerResponseDto } from '../customer/customer/dto/customer-response.dto';
import { DossiersService } from '../dossiers/dossiers.service';
import { EmployeeService } from '../agencies/employee/employee.service';
import { DiligencesService } from '../diligence/diligence.service';
import { DiligenceResponseDto } from '../diligence/dto/response-diligence.dto';
import { AudiencesService } from '../audiences/audiences.service';
import { AudienceResponseDto } from '../audiences/dto/response-audience.dto';
import { FactureService } from '../facture/facture.service';
import { FactureResponseDto } from '../facture/dto/facture-response.dto';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DocumentCustomerResponseDto } from '../documents/document-customer/dto/document-customer-response.dto';
import { SuppliersService } from '../supplier/supplier.service';
import { Supplier } from '../supplier/entities/supplier.entity';
import { ReferrersService } from '../referral/referral.service';
import { Referrer } from '../referral/entities/referral.entity';
import {
  MentionGroup,
  MentionItem,
  MentionSearchDto,
  MentionType,
  SearchUser,
} from './search.dto';

/** Le menu ne cherche partout qu'à partir de 2 caractères. */
const MIN_QUERY = 2;

type Row = Record<string, any>;
type Paging = { page: number; limit: number };
type Page = { data?: unknown[]; meta?: { total?: number } } | unknown[];

interface MentionSource {
  type: MentionType;
  /** Droit exigé par la route de recherche de la catégorie. */
  permission?: string;
  search: (
    criteria: { search: string },
    paging: Paging,
    user: SearchUser,
  ) => Promise<Page>;
  label: (row: Row) => unknown;
  sublabel?: (row: Row) => unknown;
}

/** Premier texte non vide (même règle que les libellés du menu @). */
function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Date d'audience au format du front (jj/mm/aaaa, heure du Cameroun). */
function frenchDate(value: unknown): string {
  if (!value) return '';
  const day =
    typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('fr-FR', { timeZone: 'Africa/Douala' });
}

/**
 * Repères que le chat joint à la mention (`normalizeReferencedEntity` du
 * front) : on n'envoie qu'eux, pas l'enregistrement complet.
 */
const DATA_KEYS: Record<string, string[]> = {
  reference: ['reference', 'dossier_reference', 'client_reference'],
  numero: ['numero', 'number', 'dossier_number', 'code'],
  email: ['email'],
  phone: ['phone', 'telephone', 'number_phone_1', 'professional_phone'],
  date: ['date', 'audience_date'],
};

function mentionData(row: Row): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, fields] of Object.entries(DATA_KEYS)) {
    const value = fields
      .map((field) => row[field])
      .find(
        (item) =>
          item !== undefined && item !== null && String(item).trim() !== '',
      );
    if (value !== undefined) data[key] = value;
  }
  return data;
}

/**
 * Recherche « partout » du menu @ du chat IA en une requête.
 *
 * Chaque catégorie passe par la recherche de son propre module (celle des
 * routes `GET /<module>/search`) : mêmes champs cherchés, même tri, et mêmes
 * filtres cabinet et confidentialité, appliqués par les patchs de Repository
 * dans le contexte de la requête.
 */
@Injectable()
export class MentionSearchService {
  private readonly logger = new Logger(MentionSearchService.name);
  private readonly sources: MentionSource[];

  constructor(
    customers: CustomersService,
    dossiers: DossiersService,
    employees: EmployeeService,
    diligences: DiligencesService,
    audiences: AudiencesService,
    factures: FactureService,
    documents: DocumentCustomerService,
    suppliers: SuppliersService,
    referrers: ReferrersService,
  ) {
    this.sources = [
      {
        type: 'client',
        permission: 'view_clients',
        search: (criteria, paging) =>
          customers.searchWithTransformer(
            criteria,
            CustomerResponseDto,
            paging as any,
          ),
        label: (c) =>
          firstText(c.full_name) ??
          [c.first_name, c.last_name].filter(Boolean).join(' '),
        sublabel: (c) =>
          firstText(c.email, c.phone, c.phone_number, c.company_name),
      },
      {
        type: 'dossier',
        permission: 'view_dossiers',
        // Portée client des dossiers, comme GET /dossiers/search.
        search: (criteria, paging, user) =>
          dossiers.searchForUser(criteria, paging as any, user as any),
        label: (d) =>
          [`#${d.dossier_number}`, firstText(d.object)]
            .filter(Boolean)
            .join(' — '),
        sublabel: (d) =>
          firstText(
            d.client?.full_name,
            d.client_name,
            d.customer?.full_name,
            d.jurisdiction?.name,
            d.court_name,
          ),
      },
      {
        type: 'employee',
        permission: 'view_user_directory',
        search: (criteria, paging) =>
          employees.searchDirectory(criteria, paging),
        label: (e) => firstText(e.full_name),
        sublabel: (e) => firstText(e.job_title, e.position, e.email),
      },
      {
        type: 'diligence',
        search: (criteria, paging) =>
          diligences.searchWithTransformer(
            criteria,
            DiligenceResponseDto,
            paging as any,
          ),
        label: (d) => firstText(d.title, d.object, d.description),
      },
      {
        type: 'audience',
        permission: 'view_audiences',
        search: (criteria, paging) =>
          audiences.searchWithTransformer(
            criteria,
            AudienceResponseDto,
            paging as any,
          ),
        label: (a) => {
          const type =
            firstText(a.audience_type?.name, a.type?.name) ?? 'Audience';
          const date = frenchDate(a.audience_date);
          return date ? `${type} — ${date}` : type;
        },
      },
      {
        type: 'facture',
        permission: 'view_factures',
        search: (criteria, paging) =>
          factures.searchWithTransformer(
            criteria,
            FactureResponseDto,
            paging as any,
          ),
        label: (f) => firstText(f.numero, f.reference) ?? `Facture #${f.id}`,
      },
      {
        type: 'document',
        permission: 'view_documents',
        search: (criteria, paging) =>
          documents.searchWithTransformer(
            criteria,
            DocumentCustomerResponseDto,
            paging as any,
          ),
        label: (d) =>
          firstText(d.name, d.original_name, d.filename) ?? `Document #${d.id}`,
      },
      {
        type: 'fournisseur',
        permission: 'view_suppliers',
        search: (criteria, paging) =>
          suppliers.searchWithTransformer(criteria, Supplier, paging as any),
        label: (s) => firstText(s.company_name, s.contact_name, s.email),
      },
      {
        type: 'apporteur',
        permission: 'view_referrers',
        search: (criteria, paging) =>
          referrers.searchWithTransformer(criteria, Referrer, paging as any),
        label: (r) => firstText(r.company_name, r.contact_name, r.email),
      },
    ];
  }

  private can(user: SearchUser, permission?: string) {
    return (
      !permission ||
      user.role === 'admin' ||
      user.permissions?.includes('SUPER_ADMIN') ||
      user.permissions?.includes(permission)
    );
  }

  async search({ q = '', limit = 3 }: MentionSearchDto, user: SearchUser) {
    const term = q.trim();
    if (term.length < MIN_QUERY) return [];
    const groups = await Promise.all(
      this.sources
        .filter((source) => this.can(user, source.permission))
        .map((source) => this.searchSource(source, term, limit, user)),
    );
    return groups.filter(
      (group): group is MentionGroup => !!group?.items.length,
    );
  }

  private async searchSource(
    source: MentionSource,
    search: string,
    limit: number,
    user: SearchUser,
  ): Promise<MentionGroup | null> {
    try {
      // Sans `sort_by`, comme l'appel du menu aujourd'hui : même ordre de résultats.
      const page = await source.search({ search }, { page: 1, limit }, user);
      const rows = (Array.isArray(page) ? page : (page?.data ?? [])) as Row[];
      const items: MentionItem[] = rows
        // Filet de sécurité : jamais une ligne d'un autre cabinet.
        .filter(
          (row) =>
            row?.tenant_id == null ||
            Number(row.tenant_id) === Number(user.tenantId),
        )
        .map((row) => {
          const plain = instanceToPlain(row) as Row;
          return {
            id: row.id ?? plain.id,
            label: firstText(source.label(plain)) ?? `#${row.id ?? plain.id}`,
            sublabel: firstText(source.sublabel?.(plain)),
            data: mentionData(plain),
          };
        });
      const total = Array.isArray(page)
        ? rows.length
        : Number(page?.meta?.total ?? rows.length);
      return { type: source.type, items, hasMore: total > items.length };
    } catch (error) {
      // Une catégorie en échec ne prive pas le menu des autres.
      this.logger.warn(
        `Recherche @ « ${source.type} » en échec : ${(error as Error)?.message}`,
      );
      return null;
    }
  }
}
