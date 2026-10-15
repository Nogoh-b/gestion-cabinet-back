import { Injectable } from '@nestjs/common';
import {
  DataSource,
  Brackets,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import {
  addDossierVisibilityCondition,
  addRelatedDossierVisibilityCondition,
} from '../dossiers/dossier-visibility';
import {
  GlobalSearchDto,
  GlobalSearchResult,
  SEARCH_TYPES,
  SearchDossier,
  SearchType,
  SearchUser,
} from './search.dto';

const PAGE_SIZE = 10;
const CLIENT_NAME =
  "COALESCE(NULLIF(c.company_name, ''), NULLIF(c.full_name, ''), CONCAT_WS(' ', c.last_name, c.first_name), '')";
const CLIENT_FIELDS = [
  'c.company_name',
  'c.full_name',
  'c.last_name',
  'c.first_name',
  'c.customer_code',
  'c.email',
  'c.professional_phone',
];
const DOSSIER_FIELDS = ['d.dossier_number', 'd.object'];

@Injectable()
export class GlobalSearchService {
  constructor(private readonly db: DataSource) {}

  private can(user: SearchUser, permission: string) {
    return (
      user.role === 'admin' ||
      user.permissions?.includes('SUPER_ADMIN') ||
      user.permissions?.includes(permission)
    );
  }

  private match(
    qb: SelectQueryBuilder<ObjectLiteral>,
    fields: string[],
    q: string,
  ) {
    // Escape LIKE wildcards: a user searching for % must not retrieve every record.
    const term = `%${q.toLowerCase().replace(/[!%_]/g, (char) => `!${char}`)}%`;
    qb.andWhere(
      new Brackets((where) => {
        fields.forEach((field, index) => {
          const sql = `LOWER(${field}) LIKE :term ESCAPE '!'`;
          if (index === 0) where.where(sql, { term });
          else where.orWhere(sql, { term });
        });
      }),
    );
    return qb;
  }

  private dossierSelect(qb: SelectQueryBuilder<ObjectLiteral>) {
    return qb
      .addSelect('d.id', 'dossierId')
      .addSelect('d.dossier_number', 'dossierNumber')
      .addSelect('d.object', 'dossierObject')
      .addSelect(CLIENT_NAME, 'clientName');
  }

  private context(row: Record<string, any>): SearchDossier[] {
    return row.dossierId
      ? [
          {
            id: Number(row.dossierId),
            number: row.dossierNumber,
            object: row.dossierObject,
            client: row.clientName || '',
          },
        ]
      : [];
  }

  private query(type: SearchType, user: SearchUser, q: string) {
    const entity = {
      dossiers: Dossier,
      clients: Customer,
      documents: DocumentCustomer,
      audiences: Audience,
      factures: Facture,
    }[type];
    const qb = this.db
      .getRepository<ObjectLiteral>(entity)
      .createQueryBuilder('r')
      .select('r.id', 'id')
      .where('r.tenant_id = :tenantId', { tenantId: user.tenantId });
    let fields: string[];
    if (type === 'clients') {
      qb.leftJoin(Customer, 'c', 'c.id = r.id AND c.tenant_id = :tenantId');
      qb.addSelect(CLIENT_NAME, 'title')
        .addSelect('r.customer_code', 'subtitle')
        .addSelect('r.email', 'description');
      fields = CLIENT_FIELDS;
    } else {
      if (type === 'dossiers') {
        qb.innerJoin(Dossier, 'd', 'd.id = r.id AND d.tenant_id = :tenantId');
        addDossierVisibilityCondition(qb, 'd');
      } else {
        qb.leftJoin('r.dossier', 'd', 'd.tenant_id = :tenantId');
        addRelatedDossierVisibilityCondition(qb, 'r');
        // Never expose a record whose dossier was deleted or belongs to another tenant.
        qb.andWhere('(r.dossier_id IS NULL OR d.id IS NOT NULL)');
        if (!this.can(user, 'view_dossiers'))
          qb.andWhere('r.dossier_id IS NULL');
      }
      qb.leftJoin('d.client', 'c', 'c.tenant_id = :tenantId');
      this.dossierSelect(qb);
      fields = [...DOSSIER_FIELDS, ...CLIENT_FIELDS];
      if (type === 'dossiers') {
        qb.addSelect('r.dossier_number', 'title')
          .addSelect('r.object', 'subtitle')
          .addSelect('r.description', 'description');
        fields.push(
          'r.description',
          'r.opposing_party_name',
          'r.case_number',
          'r.court_name',
        );
      } else if (type === 'documents') {
        qb.leftJoin('r.document_type', 'dt');
        qb.leftJoin('r.customer', 'rc', 'rc.tenant_id = :tenantId');
        qb.addSelect('r.name', 'title')
          .addSelect('dt.name', 'subtitle')
          .addSelect('r.description', 'description');
        fields.push(
          'r.name',
          'r.description',
          'dt.name',
          'dt.code',
          'r.metadata',
          ...CLIENT_FIELDS.map((field) => field.replace('c.', 'rc.')),
        );
      } else if (type === 'audiences') {
        qb.leftJoin('r.jurisdiction', 'j').leftJoin('r.audience_type', 'at');
        qb.addSelect('at.name', 'title')
          .addSelect('r.audience_date', 'subtitle')
          .addSelect('r.audience_time', 'audienceTime')
          .addSelect('r.notes', 'description');
        fields.push(
          'r.notes',
          'r.decision',
          'r.judge_name',
          'j.name',
          'at.name',
        );
      } else {
        qb.leftJoin('r.client', 'rc', 'rc.tenant_id = :tenantId');
        qb.addSelect('r.numero', 'title')
          .addSelect('r.libelle', 'subtitle')
          .addSelect('r.description', 'description');
        fields.push(
          'r.numero',
          'r.libelle',
          'r.description',
          ...CLIENT_FIELDS.map((field) => field.replace('c.', 'rc.')),
        );
      }
    }
    return this.match(qb, fields, q)
      .orderBy('r.created_at', 'DESC')
      .addOrderBy('r.id', 'ASC');
  }

  async search({ q = '', page = 1 }: GlobalSearchDto, user: SearchUser) {
    const counts = {
      all: 0,
      dossiers: 0,
      clients: 0,
      documents: 0,
      audiences: 0,
      factures: 0,
    };
    if (!q.trim()) return { results: [], counts, page, hasNext: false };
    const permissions = {
      dossiers: 'view_dossiers',
      clients: 'view_clients',
      documents: 'view_documents',
      audiences: 'view_audiences',
      factures: 'view_factures',
    };
    const groups = await Promise.all(
      SEARCH_TYPES.map(async (type) => {
        if (!this.can(user, permissions[type])) return [];
        const qb = this.query(type, user, q.trim());
        const [rows, count] = await Promise.all([
          qb
            .clone()
            .offset((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .getRawMany(),
          qb.clone().getCount(),
        ]);
        counts[type] = count;
        const paths = {
          dossiers: '/dossiers',
          clients: '/clients',
          documents: '/documents',
          audiences: '/audiences',
          factures: '/facturation/factures',
        };
        const results: GlobalSearchResult[] = rows.map((row) => ({
          id: row.id,
          type,
          title:
            type === 'audiences'
              ? `Audience — ${row.title || 'Sans type'}`
              : row.title,
          subtitle:
            type === 'audiences'
              ? [
                  row.subtitle instanceof Date
                    ? row.subtitle.toLocaleDateString('fr-FR', {
                        timeZone: 'Africa/Douala',
                      })
                    : row.subtitle,
                  row.audienceTime,
                ]
                  .filter(Boolean)
                  .join(' à ')
              : row.subtitle || undefined,
          description: row.description || undefined,
          href: `${paths[type]}/${encodeURIComponent(row.id)}`,
          dossiers: this.context(row),
        }));
        if (
          type === 'clients' &&
          rows.length &&
          this.can(user, 'view_dossiers')
        ) {
          const dossiers = this.db
            .getRepository(Dossier)
            .createQueryBuilder('d')
            .select('d.client_id', 'clientId')
            .where('d.tenant_id = :tenantId', { tenantId: user.tenantId })
            .andWhere('d.client_id IN (:...ids)', {
              ids: rows.map((row) => row.id),
            })
            .leftJoin('d.client', 'c', 'c.tenant_id = :tenantId');
          this.dossierSelect(dossiers);
          addDossierVisibilityCondition(dossiers, 'd');
          const contexts = await dossiers.orderBy('d.id', 'ASC').getRawMany();
          results.forEach((result) => {
            result.dossiers = contexts
              .filter((row) => String(row.clientId) === String(result.id))
              .flatMap((row) => this.context(row));
          });
        }
        return results;
      }),
    );
    counts.all = SEARCH_TYPES.reduce((total, type) => total + counts[type], 0);
    return {
      results: groups.flat(),
      counts,
      page,
      hasNext: SEARCH_TYPES.some((type) => counts[type] > page * PAGE_SIZE),
    };
  }
}
