import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { escape, escapeId } from 'mysql2';
import { DataSource, EntityMetadata, EntityTarget } from 'typeorm';

import type { HiddenFields } from 'src/core/security/restricted-fields';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Step } from '../dossiers/entities/step.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentCustomerVersion } from '../documents/document-customer/entities/document-customer-version.entity';
import { DocumentCustomerNote } from '../documents/document-customer/entities/document-customer-note.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
  InvoiceLine,
} from '../case-workflow/entities/billing.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../case-workflow/entities/dossier-action.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';

/**
 * EXPORT SQL D'UN DOSSIER — `database/dossier-<numero>.sql` du ZIP.
 *
 * Produit des INSERT réimportables dans une base qui porte le schéma de
 * l'application (migrations appliquées) :
 *  - lignes de référence (client, avocat + son compte, juridictions, types de
 *    procédure) en `INSERT IGNORE` : deux exports qui partagent un client
 *    s'importent l'un après l'autre sans conflit ;
 *  - le dossier, puis ses tables à `dossier_id`, puis les tables enfants par
 *    clé parente (paiements par facture, liens d'actions, versions et notes de
 *    documents, tables de jointure des documents d'audience / d'étape…).
 *
 * Sécurité :
 *  - TOUTES les requêtes portent `tenant_id = <cabinet du dossier>` (les
 *    référentiels juridiction / procédure acceptent aussi les données globales
 *    tenant 1), et les lignes relues sont revérifiées ;
 *  - mêmes droits que le reste de l'export : sans droit factures, ni factures,
 *    ni lignes, ni paiements ; sans droit facturation, ni profil, ni règles,
 *    ni éléments facturables ; sans droit actions, aucune action ;
 *  - colonnes restreintes (salaire, taux, budget…) vidées comme dans le JSON,
 *    secrets (mot de passe, jetons, clés client) toujours vidés ;
 *  - valeurs échappées par mysql2 (`escape` / `escapeId`), jamais concaténées.
 */

type Row = Record<string, unknown>;

export interface DossierSqlScope {
  tenantId: number;
  dossierIds: number[];
  include: { invoices: boolean; billing: boolean; actions: boolean };
  hidden: HiddenFields;
  /** Libellé de l'en-tête (numéro(s) de dossier). */
  label?: string;
}

interface TableDump {
  table: string;
  meta?: EntityMetadata;
  rows: Row[];
  /** INSERT IGNORE : ligne de référence potentiellement déjà présente. */
  ignore: boolean;
}

/** Colonnes jamais exportées, quel que soit le droit de l'appelant. */
const ALWAYS_MASKED: Record<string, string[]> = {
  user: ['password', 'refreshToken', 'fcmToken'],
  customer: ['private_key', 'public_key'],
  employee: [
    'birth_date',
    'birth_place',
    'home_address',
    'personal_phone',
    'marital_status',
    'children_count',
  ],
};

/** Lignes par INSERT : assez pour rester compact, assez peu pour max_allowed_packet. */
const ROWS_PER_INSERT = 50;

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

/**
 * Date relue par le pilote (fuseau de connexion « local », valeur par défaut
 * de TypeORM/mysql2) → littéral SQL dans le même fuseau.
 */
function sqlDate(value: Date, dateOnly: boolean): string {
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  if (dateOnly) return day;
  return `${day} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}`;
}

/** Valeur → littéral SQL échappé. */
export function sqlLiteral(value: unknown, columnType?: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'NULL';
    return escape(sqlDate(value, columnType === 'date'));
  }
  if (Buffer.isBuffer(value)) return escape(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  // JSON relu comme objet par le pilote : réécrit en texte JSON.
  if (typeof value === 'object') return escape(JSON.stringify(value));
  return escape(String(value));
}

@Injectable()
export class DossierSqlExporter {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async export(scope: DossierSqlScope): Promise<string> {
    const { tenantId, include } = scope;
    const dumps: TableDump[] = [];
    const references: TableDump[] = [];
    const ids = (rows: Row[], column = 'id') =>
      [...new Set(rows.map((r) => r[column]).filter((v) => v !== null && v !== undefined))] as (
        | string
        | number
      )[];

    const add = async (
      entity: EntityTarget<unknown>,
      column: string,
      values: unknown[],
    ): Promise<Row[]> => {
      const meta = this.db.getMetadata(entity);
      const rows = await this.select(meta, column, values, [tenantId]);
      dumps.push({ table: meta.tableName, meta, rows, ignore: false });
      if (rows.length) await this.addJunctions(meta, rows, dumps);
      return rows;
    };

    // ── Dossier et tables à dossier_id ──
    const dossiers = await add(Dossier, 'id', scope.dossierIds);
    const dossierIds = ids(dossiers);
    await add(Step, 'dossier_id', dossierIds);
    const documents = await add(DocumentCustomer, 'dossier_id', dossierIds);
    const documentIds = ids(documents);
    await add(DocumentCustomerVersion, 'document_id', documentIds);
    await add(DocumentCustomerNote, 'document_id', documentIds);
    const audiences = await add(Audience, 'dossier_id', dossierIds);
    const diligences = await add(Diligence, 'dossier_id', dossierIds);

    let factures: Row[] = [];
    if (include.invoices) {
      factures = await add(Facture, 'dossier_id', dossierIds);
      const factureIds = ids(factures);
      await add(InvoiceLine, 'facture_id', factureIds);
      await add(Paiement, 'facture_id', factureIds);
    }

    let billableItems: Row[] = [];
    if (include.billing) {
      await add(DossierBillingProfile, 'dossier_id', dossierIds);
      await add(DossierBillingRule, 'dossier_id', dossierIds);
      billableItems = await add(BillableItem, 'dossier_id', dossierIds);
    }

    if (include.actions) {
      const actions = await add(DossierAction, 'dossier_id', dossierIds);
      const actionIds = ids(actions);
      await add(DossierActionDocumentLink, 'action_id', actionIds);
      await add(DossierActionAudienceLink, 'action_id', actionIds);
      await add(DossierActionRelation, 'action_id', actionIds);
    }

    // ── Lignes de référence (INSERT IGNORE) ──
    const reference = async (
      entity: EntityTarget<unknown>,
      values: unknown[],
      tenants: number[],
    ) => {
      const meta = this.db.getMetadata(entity);
      const rows = await this.select(meta, 'id', values, tenants);
      references.push({ table: meta.tableName, meta, rows, ignore: true });
    };
    const shared = tenantId === 1 ? [1] : [1, tenantId];
    await reference(
      Jurisdiction,
      [...ids(dossiers, 'jurisdiction_id'), ...ids(audiences, 'jurisdiction_id')],
      shared,
    );
    await reference(
      ProcedureType,
      [...ids(dossiers, 'procedure_type_id'), ...ids(dossiers, 'procedure_subtype_id')],
      shared,
    );
    await reference(
      Customer,
      [...ids(dossiers, 'client_id'), ...ids(factures, 'client_id'), ...ids(billableItems, 'client_id')],
      [tenantId],
    );
    // Employee partage la clé de User : le compte porte le nom de l'avocat.
    const people = [...ids(dossiers, 'lawyer_id'), ...ids(diligences, 'assigned_lawyer_id')];
    await reference(User, people, [tenantId]);
    await reference(Employee, people, [tenantId]);

    return this.render(scope, [...references, ...dumps]);
  }

  /**
   * `SELECT *` (et non les colonnes de l'entité) : l'export suit la base réelle,
   * même si une migration d'un autre lot ajoute une colonne.
   */
  private async select(
    meta: EntityMetadata,
    column: string,
    values: unknown[],
    tenants: number[],
  ): Promise<Row[]> {
    const unique = [...new Set(values)];
    if (!unique.length) return [];
    const conditions = [`${escapeId(column)} IN (?)`];
    const params: unknown[] = [unique];
    const hasTenant = !!meta.findColumnWithDatabaseName('tenant_id');
    if (hasTenant) {
      conditions.push(`${escapeId('tenant_id')} IN (?)`);
      params.push(tenants);
    }
    if (meta.deleteDateColumn) {
      conditions.push(`${escapeId(meta.deleteDateColumn.databaseName)} IS NULL`);
    }
    const order = meta.primaryColumns.map((c) => escapeId(c.databaseName)).join(', ');
    const rows: Row[] = await this.db.query(
      `SELECT * FROM ${escapeId(meta.tableName)} WHERE ${conditions.join(' AND ')}${order ? ` ORDER BY ${order}` : ''}`,
      params,
    );
    // Défense en profondeur : aucune ligne d'un autre cabinet, quoi qu'ait
    // répondu la requête.
    return hasTenant
      ? rows.filter((r) => tenants.includes(Number(r.tenant_id)))
      : rows;
  }

  /** Tables de jointure ManyToMany possédées par l'entité, filtrées par propriétaire. */
  private async addJunctions(meta: EntityMetadata, owners: Row[], dumps: TableDump[]) {
    for (const relation of meta.manyToManyRelations) {
      const junction = relation.junctionEntityMetadata;
      if (!relation.isOwning || !junction) continue;
      const [ownerColumn] = junction.ownerColumns;
      const referenced = ownerColumn?.referencedColumn?.databaseName ?? 'id';
      if (!ownerColumn) continue;
      const values = [...new Set(owners.map((o) => o[referenced]))];
      if (!values.length) continue;
      const rows: Row[] = await this.db.query(
        `SELECT * FROM ${escapeId(junction.tableName)} WHERE ${escapeId(ownerColumn.databaseName)} IN (?)`,
        [values],
      );
      dumps.push({ table: junction.tableName, meta: junction, rows, ignore: true });
    }
  }

  private masked(table: string, column: string, hidden: HiddenFields): boolean {
    return (
      ALWAYS_MASKED[table]?.includes(column) === true ||
      hidden.everywhere.has(column) ||
      (table === 'dossiers' && hidden.onDossier.has(column))
    );
  }

  private render(scope: DossierSqlScope, dumps: TableDump[]): string {
    const out: string[] = [
      `-- Export SQL ${scope.label ? `du dossier ${scope.label}` : 'de dossier(s)'}`,
      `-- Cabinet (tenant_id) : ${Number(scope.tenantId)}`,
      `-- Généré le ${new Date().toISOString()}`,
      `-- Contenu : dossier, étapes, documents, audiences, diligences${scope.include.invoices ? ', factures et paiements' : ''}${scope.include.billing ? ', facturation' : ''}${scope.include.actions ? ', actions' : ''}.`,
      "-- À importer dans une base portant le schéma de l'application (migrations appliquées).",
      '-- Les fichiers des documents sont dans le dossier documents/ du ZIP, pas dans ce script.',
      '',
      'SET NAMES utf8mb4;',
      'SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS;',
      'SET FOREIGN_KEY_CHECKS=0;',
      "SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';",
      'START TRANSACTION;',
      '',
    ];

    for (const dump of dumps) {
      if (!dump.rows.length) continue;
      // Colonnes générées (ex. billable_items.professional_action_key) : la base
      // les recalcule, un INSERT explicite serait refusé.
      const generated = new Set(
        (dump.meta?.columns ?? [])
          .filter((c) => c.generatedType || c.asExpression)
          .map((c) => c.databaseName),
      );
      const columns = Object.keys(dump.rows[0]).filter((c) => !generated.has(c));
      const typeOf = (c: string) => dump.meta?.findColumnWithDatabaseName(c)?.type;
      /** Colonne masquée : NULL, sinon sa valeur par défaut, sinon un zéro neutre. */
      const maskedValue = (c: string) => {
        const column = dump.meta?.findColumnWithDatabaseName(c);
        if (!column || column.isNullable) return 'NULL';
        if (column.default !== undefined) return 'DEFAULT';
        const type = String(column.type ?? '');
        return column.type === Number || /int|dec|num|float|double|real/i.test(type)
          ? '0'
          : "''";
      };

      out.push(`-- ${dump.table} (${dump.rows.length})`);
      const head = `${dump.ignore ? 'INSERT IGNORE' : 'INSERT'} INTO ${escapeId(dump.table)} (${columns.map((c) => escapeId(c)).join(', ')}) VALUES`;
      for (let i = 0; i < dump.rows.length; i += ROWS_PER_INSERT) {
        const values = dump.rows.slice(i, i + ROWS_PER_INSERT).map(
          (row) =>
            `(${columns
              .map((c) =>
                this.masked(dump.table, c, scope.hidden)
                  ? maskedValue(c)
                  : sqlLiteral(row[c], typeOf(c)),
              )
              .join(', ')})`,
        );
        out.push(`${head}\n${values.join(',\n')};`);
      }
      out.push('');
    }

    out.push(
      'COMMIT;',
      'SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;',
      'SET SQL_MODE=@OLD_SQL_MODE;',
      '',
    );
    return out.join('\n');
  }
}
