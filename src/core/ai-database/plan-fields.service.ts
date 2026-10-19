import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityMetadata, FindOptionsWhere } from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { getCurrentTenantId, hasActiveTenant } from '../tenant/tenant.context';
import { isSharedEntity } from '../tenant/tenant.decorator';
import { AiDatabasePermissionService, AiUserContext } from './ai-database-permission.service';
import { AI_DATABASE_PROJECT_CONFIG } from './ai-database.tokens';
import { WriteOperation, WritePlan } from './dto/analysis-response.dto';
import {
  FieldOptionsRequest,
  FieldOptionsResponse,
  PlanFieldDescriptor,
  PlanFieldsResponse,
  PlanOperationDescriptor,
} from './dto/plan-fields.dto';
import { AiDatabaseProjectConfig } from './interfaces/ai-database-project-config.interface';
import { SchemaMetadataService } from './schema-metadata.service';
import { AUTO_GENERATED_FIELDS, BaseWriteHandler } from './write/base-write-handler';
import { EntityResolverService } from './write/entity-resolver.service';
import { matchEnumValue, parseLenientBoolean } from './write/lenient-values';
import { PLAN_REF, PlanFieldOption, fixedOptions, humanize, parseValueList, rowLabel } from './write/plan-field-options';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { displayValue, PARENT_LINKS, resourceTitle } from './write/write-result-summary';
import { GenericWriteService } from './generic-write.service';
import { AiActionRegistry } from './write/ai-action.registry';

type User = AiUserContext | string | number | undefined | null;

/** Clé étrangère d'une opération : alias (« client »), colonne (« client_id »), table référencée. */
interface ReferenceInfo {
  alias: string;
  fkColumn: string;
  keys: string[];
  table: string;
  meta: EntityMetadata;
  nullable: boolean;
}

/** Règles propres à certains champs, que les métadonnées ne disent pas. */
interface FieldHint {
  filters?: Record<string, any>;
  dependsOn?: string[];
  readOnly?: string;
}

type HintFactory = (resolved: Record<string, unknown>, op: WriteOperation) => FieldHint | undefined;

const FIELD_HINTS: Record<string, Record<string, HintFactory>> = {
  dossiers: {
    // Types et sous-types partagent la table procedure_types (cf. DossierWriteHandler).
    procedure_type_id: () => ({ filters: { is_subtype: false } }),
    procedure_subtype_id: (resolved) => ({
      filters: {
        is_subtype: true,
        ...(typeof resolved.procedure_type_id === 'number' && { parent_id: resolved.procedure_type_id }),
      },
      dependsOn: ['procedure_type_id', 'procedure_type'],
    }),
  },
  customer: {
    // Customer.beforeCreate force le statut « Actif ».
    status: (_resolved, op) => (op.operation === 'INSERT' ? { readOnly: 'Toujours « Actif » à la création' } : undefined),
  },
};

/** Lignes actives seulement, pour les tables qui le disent par une colonne de statut. */
const ACTIVE_STATUS_TABLES = new Set(['type_customer', 'customer', 'employee']);
const HIDDEN_FIELDS = new Set(['id', 'tenant_id', 'lock_version', 'idempotency_key', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by']);
const LIST_LIMIT = 100;
const SEARCH_LIMIT = 20;
const MAX_OPERATIONS = 20;
const MAX_FIELDS = 80;

const isId = (value: unknown) => BaseWriteHandler.isAlreadyId(value);

/**
 * Décrit les champs d'un plan d'écriture IA pour la carte de confirmation :
 * libellés français, valeur reconnue, listes de choix (clés étrangères,
 * énumérations), et options d'un champ à la demande (recherche, dépendance).
 *
 * Les lignes viennent des repositories, filtrés automatiquement par cabinet ;
 * une table que l'utilisateur ne peut pas lire n'est ni listée ni résolue.
 */
@Injectable()
export class PlanFieldsService {
  private readonly logger = new Logger(PlanFieldsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: WriteHandlerRegistry,
    private readonly schemaMetadata: SchemaMetadataService,
    private readonly entityResolver: EntityResolverService,
    private readonly permissions: AiDatabasePermissionService,
    @Optional() @Inject(AI_DATABASE_PROJECT_CONFIG) private readonly projectConfig?: AiDatabaseProjectConfig,
    @Optional() private readonly writes?: GenericWriteService,
    @Optional() private readonly actions?: AiActionRegistry,
  ) {}

  async describePlan(user: User, plan: WritePlan): Promise<PlanFieldsResponse> {
    const operations = (plan?.operations ?? []).slice(0, MAX_OPERATIONS);
    await this.permissions.assertCanWritePlan(user, { ...plan, operations });
    const described: PlanOperationDescriptor[] = [];
    for (const [index, op] of operations.entries()) {
      described.push(await this.describeOperation(user, operations, index, op));
    }
    return { operations: described };
  }

  async fieldOptions(user: User, request: FieldOptionsRequest): Promise<FieldOptionsResponse> {
    const meta = this.metadataFor(request?.entity);
    if (!meta || !['INSERT', 'UPDATE'].includes(request.operation)) throw new BadRequestException('Champ inconnu');
    const op = { operation: request.operation, entity: meta.tableName, fields: request.fields ?? {} } as WriteOperation;
    await this.permissions.assertCanWritePlan(user, { operations: [op] } as WritePlan);
    const reference = this.referenceMap(meta).get(request.field);
    if (!reference || !(await this.canList(user, reference))) return { options: [], searchable: false };

    const resolved = await this.resolvedParents(meta, op);
    const hint = FIELD_HINTS[meta.tableName]?.[reference.fkColumn]?.(resolved, op);
    const filters = { ...this.activeWhere(reference), ...hint?.filters };
    const q = String(request.q ?? '').trim().slice(0, 100);
    if (q) {
      const found = await this.entityResolver.searchCandidates(reference.table, q, filters, SEARCH_LIMIT);
      const rows = this.preferOwnRows(reference, found);
      return { options: rows.map((row) => this.toOption(row)), searchable: true };
    }
    return this.listRows(reference, filters);
  }

  // ── Opération ─────────────────────────────────────────────────────────────

  private async describeOperation(user: User, all: WriteOperation[], index: number, op: WriteOperation): Promise<PlanOperationDescriptor> {
    if (op.operation === 'ACTION') return this.describeAction(all, index, op);
    const meta = this.metadataFor(op.entity);
    const entityLabel = (meta && this.schemaMetadata.getTableLabel(meta.tableName)) || humanize(op.entity ?? '');
    const fields = op.fields ?? {};
    const descriptors: PlanFieldDescriptor[] = [];
    const references = meta ? this.referenceMap(meta) : new Map<string, ReferenceInfo>();
    const handlerLabels = await this.handlerLabels(op.entity);
    const resolved: Record<string, unknown> = {};
    const done = new Set<string>();

    // Les champs dépendants (sous-type) après leur parent (type).
    const names = Object.keys(fields).filter((name) => !HIDDEN_FIELDS.has(name)).slice(0, MAX_FIELDS);
    const dependent = (name: string) => {
      const reference = references.get(name);
      return reference ? !!FIELD_HINTS[meta!.tableName]?.[reference.fkColumn]?.({}, op)?.dependsOn : false;
    };
    names.sort((a, b) => Number(dependent(a)) - Number(dependent(b)));

    for (const name of names) {
      if (done.has(name)) continue;
      const raw = fields[name];
      if (raw === undefined) continue;
      const reference = references.get(name);
      if (reference && meta) {
        reference.keys.forEach((key) => done.add(key));
        const descriptor = await this.describeReference(user, all, index, op, meta, reference, resolved);
        if (typeof descriptor.selected?.value === 'number') resolved[reference.fkColumn] = descriptor.selected.value;
        descriptors.push(descriptor);
        continue;
      }
      done.add(name);
      descriptors.push(
        raw !== null && typeof raw === 'object'
          ? this.describeList(all, op, meta, name, raw, handlerLabels)
          : this.describeScalar(op, meta, name, raw, handlerLabels),
      );
    }
    const target = await this.describeTarget(op, meta).catch((error: Error) => {
      this.logger.debug(`Cible de l'opération ${index} non décrite : ${error.message}`);
      return undefined;
    });
    return {
      index,
      entityLabel,
      fields: descriptors,
      ...(op.humanReadable && { summary: op.humanReadable }),
      ...(target && { target }),
    };
  }

  // ── Action (envoi d'une facture, relance…) ───────────────────────────────

  /**
   * Action du plan : ce qui part et vers qui (aperçu du handler), l'élément
   * visé, et ses paramètres (destinataire…) modifiables avant confirmation.
   */
  private async describeAction(all: WriteOperation[], index: number, op: WriteOperation): Promise<PlanOperationDescriptor> {
    const handler = this.actions?.get(op.action);
    if (!handler) throw new BadRequestException(`Action inconnue : « ${op.action ?? '?'} »`);
    const { definition } = handler;
    const meta = this.metadataFor(definition.entity);
    const fields = op.fields ?? {};

    // Élément créé plus tôt dans le plan (« crée la facture et envoie-la »).
    const placeholder = typeof op.entityId === 'string' ? op.entityId.trim().match(PLAN_REF) : null;
    const noTarget = (op.entityId === undefined || op.entityId === null || op.entityId === '') && !op.match;
    const creator = placeholder
      ? all.slice(0, index).find((other) => other.tempId === placeholder[1])
      : noTarget
        ? [...all.slice(0, index)].reverse().find((other) => other.operation === 'INSERT' && this.metadataFor(other.entity)?.tableName === definition.entity)
        : undefined;

    let target: string | undefined;
    let targetId: string | number | undefined;
    if (creator) {
      // Un numéro proposé par l'IA (« F-{{today}}-001 ») sera remplacé à la création.
      const label = [rowLabel(creator.fields), creator.fields?.description].find(
        (text) => typeof text === 'string' && text.trim() && !text.includes('{{'),
      );
      target = `${label || humanize(definition.entity)} (créé par ce plan)`;
    } else if (!placeholder) {
      targetId = isId(op.entityId) ? (op.entityId as string | number) : undefined;
      if (targetId === undefined && op.match) targetId = await this.writes?.findSingleMatch(definition.entity, op.match).catch(() => undefined);
      const described = targetId !== undefined ? { ...op, entityId: targetId, match: undefined } : op;
      target = await this.describeTarget(described, meta).catch((error: Error) => {
        this.logger.debug(`Cible de l'action ${index} non décrite : ${error.message}`);
        return undefined;
      });
    }
    const preview = targetId !== undefined
      ? await handler.preview?.(targetId, fields).catch((error: Error) => `⚠️ ${error.message}`)
      : undefined;

    const descriptors: PlanFieldDescriptor[] = definition.params.map((param) => ({
      name: param.name,
      label: param.label,
      kind: 'text',
      value: fields[param.name],
      editable: true,
      ...(param.description && { note: param.description }),
    }));
    return {
      index,
      entityLabel: definition.label,
      fields: descriptors,
      ...(op.humanReadable && { summary: op.humanReadable }),
      ...(target && { target }),
      ...(preview && { preview }),
      ...(definition.warning && { warning: definition.warning }),
    };
  }

  // ── Cible d'une modification / suppression ────────────────────────────────

  private async describeTarget(op: WriteOperation, meta: EntityMetadata | undefined): Promise<string | undefined> {
    if (op.operation === 'INSERT' || !meta) return undefined;
    const table = meta.tableName;
    if (op.entityId !== undefined && op.entityId !== null && op.entityId !== '') {
      const row: any = await this.dataSource.getRepository(meta.target).findOne({ where: { id: op.entityId } as any });
      if (!row) return `#${op.entityId}`;
      const parents = await this.parentLabels(table, row);
      return [resourceTitle(table, row, row.id), ...parents].join(' · ');
    }
    if (!op.match || typeof op.match !== 'object') return undefined;
    const criteria: string[] = [];
    for (const [column, value] of Object.entries(op.match)) {
      if (value === null || value === undefined || value === '') continue;
      const parent = PARENT_LINKS.find((p) => p.column === column || p.column === `${column}_id`);
      if (parent && isId(value)) {
        const [label] = await this.parentLabels(table, { [parent.column]: value });
        criteria.push(label ?? `${column} = ${value}`);
        continue;
      }
      const shown =
        parseValueList(this.schemaMetadata.getColumnDescription(table, column))?.find((o) => String(o.value) === String(value))?.label ??
        displayValue(value);
      criteria.push(`${this.schemaMetadata.getBusinessLabel(table, column)} = ${shown}`);
    }
    const what = criteria.join(' · ');
    if (!op.all) return what ? `Élément correspondant à : ${what}` : undefined;
    const total = await this.writes?.countMatches(table, op.match).catch(() => undefined);
    return `Tous les éléments correspondants${total !== undefined ? ` (${total})` : ''}${what ? ` : ${what}` : ''}`;
  }

  /** « Dossier DOS-2026-0039 — Trouble de jouissance » pour les parents d'une ligne. */
  private async parentLabels(table: string, row: Record<string, any>): Promise<string[]> {
    const labels: string[] = [];
    for (const parent of PARENT_LINKS) {
      const id = row[parent.column];
      if (parent.entity === table || !isId(id)) continue;
      const meta = this.metadataFor(parent.entity);
      if (!meta) continue;
      const found: any = await this.dataSource.getRepository(meta.target).findOne({ where: { id } as any }).catch(() => null);
      labels.push(`${this.schemaMetadata.getTableLabel(parent.entity) || humanize(parent.entity)} ${found ? resourceTitle(parent.entity, found, id) : `#${id}`}`);
    }
    return labels;
  }

  private async describeReference(
    user: User,
    all: WriteOperation[],
    index: number,
    op: WriteOperation,
    meta: EntityMetadata,
    reference: ReferenceInfo,
    resolved: Record<string, unknown>,
  ): Promise<PlanFieldDescriptor> {
    const fields = op.fields ?? {};
    // La colonne l'emporte à l'exécution quand elle porte déjà un identifiant.
    const present = reference.keys.filter((key) => fields[key] !== undefined);
    const winner = fields[reference.fkColumn] !== undefined && (isId(fields[reference.fkColumn]) || PLAN_REF.test(String(fields[reference.fkColumn])))
      ? reference.fkColumn
      : present.find((key) => key !== reference.fkColumn) ?? reference.fkColumn;
    const raw = fields[winner];
    const base: PlanFieldDescriptor = {
      name: reference.fkColumn,
      label: this.fieldLabel(meta.tableName, [reference.fkColumn, reference.alias]),
      kind: 'reference',
      value: raw,
      clears: present.filter((key) => key !== reference.fkColumn),
      editable: op.operation !== 'DELETE',
    };
    if (op.operation === 'DELETE') return { ...base, editable: false, selected: { value: raw as any, label: String(raw) } };

    // Ligne créée plus tôt dans le plan (« {{new_client.id}} »).
    const created: PlanFieldOption[] = all.slice(0, index).flatMap((other, otherIndex) =>
      other.operation === 'INSERT' && other.tempId && this.metadataFor(other.entity)?.tableName === reference.table
        ? [{ value: `{{${other.tempId}.id}}`, label: `${rowLabel(other.fields) || other.tempId} (créé par ce plan)`, createdBy: otherIndex }]
        : []);
    const placeholder = typeof raw === 'string' ? raw.match(PLAN_REF) : null;

    if (!(await this.canList(user, reference))) {
      return { ...base, editable: false, selected: created.find((o) => o.value === raw) ?? { value: raw as any, label: String(raw) }, note: 'Liste non consultable avec vos droits' };
    }

    const hint = FIELD_HINTS[meta.tableName]?.[reference.fkColumn]?.(resolved, op);
    const filters = { ...this.activeWhere(reference), ...hint?.filters };
    const listing = await this.listRows(reference, filters);
    let options = [...created, ...listing.options];
    let selected: PlanFieldOption | null = null;
    let note: string | undefined;
    let needsChoice = false;

    if (placeholder) {
      selected = created.find((option) => option.value === raw) ?? null;
      if (!selected) {
        note = 'Référence à une opération inconnue';
        needsChoice = true;
      }
    } else if (isId(raw)) {
      const row = await this.findRow(reference, raw);
      selected = row ? this.toOption(row) : null;
      if (!selected) {
        note = 'Introuvable dans ce cabinet';
        needsChoice = true;
      }
    } else if (typeof raw === 'string' && raw.trim()) {
      // Même résolution (déterministe) qu'à l'exécution : présélection seulement si elle est sûre.
      const result = await this.entityResolver.resolveAnyEntity(reference.table, raw, undefined, hint?.filters);
      const best = result.found ? result.best : this.unambiguous(reference, result);
      if (best) {
        selected = this.toOption(best);
      } else {
        options = [...options, ...this.preferOwnRows(reference, result.candidates.slice(0, 8).map((c) => c.entity)).map((row) => this.toOption(row))];
        // Sans aucun enregistrement approchant, l'exécution crée la valeur ;
        // sinon elle demandera de choisir (jamais de doublon silencieux).
        const created = !this.neverAutoCreate().has(reference.table) && !result.candidates.length;
        selected = { value: raw, label: `« ${raw} »${created ? ' (nouveau)' : ' (à choisir)'}` };
        note = result.ambiguous
          ? 'Plusieurs correspondances exactes : choisissez la bonne'
          : created
            ? `Introuvable : « ${raw} » sera créé si vous ne choisissez pas`
            : result.candidates.length
              ? 'Aucune correspondance exacte : choisissez dans la liste'
              : 'Introuvable : choisissez dans la liste';
        needsChoice = true;
      }
    }

    if (op.operation === 'INSERT' && reference.nullable) options = [{ value: null, label: '— Aucun —' }, ...options];
    // La valeur du plan figure toujours dans la liste (en tête si elle n'y est pas).
    if (selected && !options.some((option) => option.value === selected!.value)) options = [selected, ...options];
    return {
      ...base,
      selected,
      options: dedupe(options),
      searchable: listing.searchable,
      ...(hint?.dependsOn && { dependsOn: hint.dependsOn }),
      ...(needsChoice && { needsChoice }),
      ...(note && { note }),
    };
  }

  /**
   * Liste ou objet (liens d'une action vers ses documents/audiences, données
   * JSON…) : affiché en clair, non modifiable dans la carte. Les références
   * {{tempId.id}} sont nommées d'après l'opération du plan qui les crée.
   */
  private describeList(
    all: WriteOperation[],
    op: WriteOperation,
    meta: EntityMetadata | undefined,
    name: string,
    raw: object,
    handlerLabels: Map<string, string>,
  ): PlanFieldDescriptor {
    const label = handlerLabels.get(name) ?? this.fieldLabel(meta?.tableName ?? op.entity, [name]);
    const describeItem = (item: any): string => {
      const ref = item && typeof item === 'object' ? (item.id ?? item.ref ?? item.name ?? item.title) : item;
      if (ref === undefined || ref === null) return item && typeof item === 'object' ? JSON.stringify(item) : '';
      const match = PLAN_REF.exec(String(ref).trim());
      if (!match) return String(ref);
      const other = all.find((candidate) => candidate.tempId === match[1]);
      return other ? `${rowLabel(other.fields) || other.tempId} (créé par ce plan)` : String(ref);
    };
    const text = Array.isArray(raw)
      ? raw.map(describeItem).filter(Boolean).join(', ') || 'Aucun'
      : JSON.stringify(raw);
    return { name, label, kind: 'text', value: raw, selected: { value: null, label: text }, editable: false };
  }

  private describeScalar(
    op: WriteOperation,
    meta: EntityMetadata | undefined,
    name: string,
    raw: unknown,
    handlerLabels: Map<string, string>,
  ): PlanFieldDescriptor {
    const column = meta ? meta.findColumnWithDatabaseName(name) ?? meta.findColumnWithPropertyName(name) : undefined;
    const table = meta?.tableName ?? op.entity;
    const label = handlerLabels.get(name) && !handlerLabels.get(name)!.includes('(par nom)')
      ? handlerLabels.get(name)!
      : this.fieldLabel(table, [column?.databaseName ?? name, name]);
    const hint = FIELD_HINTS[table]?.[column?.databaseName ?? name]?.({}, op);
    const generated = AUTO_GENERATED_FIELDS.has(name);
    const secondary = isSecondary(column, raw) || label === this.schemaMetadata.formatTechnicalName(name);
    const editable = op.operation !== 'DELETE' && !generated && !hint?.readOnly;
    const note = generated ? 'Généré automatiquement' : hint?.readOnly;

    const description = column ? this.schemaMetadata.getColumnDescription(table, column.databaseName) : '';
    const options = column ? fixedOptions(column as { type?: unknown; enum?: Array<string | number> }, description) : null;
    if (options) {
      const values = options.map((option) => option.value as string | number);
      // L'IA écrit la valeur (« 2 ») ou son libellé (« Élevé »).
      const byLabel = Object.fromEntries(options.map((option) => [option.label, option.value as string | number]));
      const value = typeof options[0].value === 'boolean' ? parseLenientBoolean(raw) : matchEnumValue(raw, values, byLabel);
      const known = options.find((option) => option.value === value);
      const selected = known ?? { value: raw as any, label: `${String(raw)} (proposé par l'IA)` };
      return {
        name,
        label,
        kind: typeof options[0].value === 'boolean' ? 'boolean' : 'enum',
        value: raw,
        selected,
        options: known ? options : [selected, ...options],
        editable,
        ...(!known && { needsChoice: true, note: 'Valeur non reconnue : choisissez dans la liste' }),
        ...(known && secondary && { secondary }),
        ...(note && { note }),
      };
    }
    return { name, label, kind: scalarKind(column), value: raw, editable, ...(secondary && { secondary }), ...(note && { note }) };
  }

  // ── Lignes de référence ───────────────────────────────────────────────────

  private async listRows(reference: ReferenceInfo, where: Record<string, any>): Promise<FieldOptionsResponse> {
    const repo = this.dataSource.getRepository(reference.meta.target);
    const relations = this.labelRelations(reference.meta);
    const conditions = this.knownWhere(reference.meta, where);
    try {
      const total = await repo.count({ where: conditions });
      const searchable = total > LIST_LIMIT;
      const order = searchable ? { id: 'DESC' } : this.labelOrder(reference.meta);
      const rows = await repo.find({ where: conditions, order: order as any, take: searchable ? SEARCH_LIMIT : LIST_LIMIT, relations });
      return { options: this.preferOwnRows(reference, rows).map((row) => this.toOption(row)), searchable };
    } catch (error) {
      this.logger.warn(`Options de ${reference.table} indisponibles : ${(error as Error).message}`);
      return { options: [], searchable: true };
    }
  }

  private async findRow(reference: ReferenceInfo, id: unknown): Promise<any | null> {
    const repo = this.dataSource.getRepository(reference.meta.target);
    return repo.findOne({ where: { id } as FindOptionsWhere<any>, relations: this.labelRelations(reference.meta) }).catch(() => null);
  }

  /** Identifiant du parent d'un champ dépendant (type de procédure d'un sous-type). */
  private async resolvedParents(meta: EntityMetadata, op: WriteOperation): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    const references = this.referenceMap(meta);
    const hints = Object.values(FIELD_HINTS[meta.tableName] ?? {});
    const parents = new Set(hints.flatMap((factory) => factory({}, op)?.dependsOn ?? []));
    for (const parent of parents) {
      const reference = references.get(parent);
      const value = reference?.keys.map((key) => op.fields?.[key]).find((v) => v !== undefined && v !== null);
      if (!reference || value === undefined || resolved[reference.fkColumn] !== undefined) continue;
      if (isId(value)) {
        resolved[reference.fkColumn] = Number(value);
      } else if (typeof value === 'string' && !PLAN_REF.test(value)) {
        const parentHint = FIELD_HINTS[meta.tableName]?.[reference.fkColumn]?.({}, op);
        const result = await this.entityResolver.resolveAnyEntity(reference.table, value, undefined, parentHint?.filters);
        if (result.found && !result.ambiguous && result.best) resolved[reference.fkColumn] = Number(result.best.id);
      }
    }
    return resolved;
  }

  /**
   * Référentiel partagé (types de client…) : le cabinet voit les lignes de la
   * plateforme et ses propres copies (même code). À clé égale, sa copie l'emporte.
   */
  private preferOwnRows<T extends Record<string, any>>(reference: ReferenceInfo, rows: T[]): T[] {
    if (!isSharedEntity(reference.meta.target as Function)) return rows;
    const tenant = hasActiveTenant() ? getCurrentTenantId() : null;
    const keyOf = (row: T) => String(row.code ?? row.name ?? row.id).trim().toLowerCase();
    // Chaque clé garde le rang de sa première occurrence (liste triée par nom).
    const kept = new Map<string, T>();
    for (const row of rows) {
      const key = keyOf(row);
      const current = kept.get(key);
      if (!current || (row.tenant_id === tenant && current.tenant_id !== tenant)) kept.set(key, row);
    }
    return [...kept.values()];
  }

  /** Meilleur candidat, si l'ambiguïté éventuelle ne tient qu'à ce doublon. */
  /** Plusieurs lignes égales d'un référentiel partagé : la copie du cabinet, si elle est seule. */
  private unambiguous(reference: ReferenceInfo, result: { ambiguous: boolean; candidates: Array<{ entity: any }> }): any | null {
    if (!result.ambiguous) return null;
    const rows = result.candidates.map((candidate) => candidate.entity);
    const distinct = this.preferOwnRows(reference, rows);
    return distinct.length === 1 && rows.length > 1 ? distinct[0] : null;
  }

  private toOption(row: any): PlanFieldOption {
    return { value: row?.id, label: rowLabel(row) };
  }

  // ── Métadonnées ───────────────────────────────────────────────────────────

  private metadataFor(entity?: string): EntityMetadata | undefined {
    if (!entity) return undefined;
    return this.dataSource.entityMetadatas.find((meta) => meta.tableName === entity);
  }

  /** Mêmes alias que `BaseWriteHandler.buildFkMap` : propriété, colonne, colonne sans « _id ». */
  private referenceMap(meta: EntityMetadata): Map<string, ReferenceInfo> {
    const map = new Map<string, ReferenceInfo>();
    for (const relation of meta.relations) {
      if (relation.relationType !== 'many-to-one' || !relation.joinColumns?.length) continue;
      const fkColumn = relation.joinColumns[0].databaseName;
      if (!fkColumn) continue;
      const shortName = fkColumn.replace(/_id$/, '').replace(/Id$/, '');
      const keys = [...new Set([fkColumn, relation.propertyName, shortName])];
      const column = meta.columns.find((c) => c.databaseName === fkColumn);
      const info: ReferenceInfo = {
        alias: relation.propertyName,
        fkColumn,
        keys,
        table: relation.inverseEntityMetadata.tableName,
        meta: relation.inverseEntityMetadata,
        nullable: typeof (relation as any).isNullable === 'boolean' ? (relation as any).isNullable : !!column?.isNullable,
      };
      for (const key of keys) if (!map.has(key)) map.set(key, info);
    }
    return map;
  }

  private async canList(user: User, reference: ReferenceInfo): Promise<boolean> {
    // Les tables partagées (types de client…) servent de référentiel commun.
    if (isSharedEntity(reference.meta.target as Function)) return true;
    const { allowed } = await this.permissions.partitionReadableTables(user, [reference.table]);
    return allowed.length > 0;
  }

  private activeWhere(reference: ReferenceInfo): Record<string, any> {
    const columns = new Set(reference.meta.columns.map((c) => c.databaseName));
    if (columns.has('is_active')) return { is_active: true };
    if (ACTIVE_STATUS_TABLES.has(reference.table) && columns.has('status')) return { status: 1 };
    return {};
  }

  /** Filtres sur des colonnes réelles seulement, exprimés par nom de propriété. */
  private knownWhere(meta: EntityMetadata, where: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(where)) {
      const column = meta.findColumnWithDatabaseName(key) ?? meta.findColumnWithPropertyName(key);
      if (column) out[column.propertyName] = value;
    }
    return out;
  }

  private labelOrder(meta: EntityMetadata): Record<string, 'ASC'> {
    for (const name of ['name', 'label', 'title', 'full_name', 'last_name', 'libelle']) {
      const column = meta.findColumnWithDatabaseName(name);
      if (column) return { [column.propertyName]: 'ASC' };
    }
    return { id: 'ASC' } as any;
  }

  /** Employé : le nom est porté par l'utilisateur rattaché. */
  private labelRelations(meta: EntityMetadata): string[] {
    const hasOwnName = ['full_name', 'first_name', 'name', 'label', 'title', 'libelle'].some((name) => meta.findColumnWithDatabaseName(name));
    return !hasOwnName && meta.relations.some((r) => r.propertyName === 'user') ? ['user'] : [];
  }

  private fieldLabel(table: string, names: string[]): string {
    const columns = this.schemaMetadata.getColumnMetadataMap(table);
    for (const name of names) {
      const label = columns?.get(name)?.label;
      if (label && label !== this.schemaMetadata.formatTechnicalName(name)) return label;
    }
    for (const name of names) {
      const label = this.projectConfig?.fieldLabels?.[name.replace(/_id$/, '')];
      if (label) return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return this.schemaMetadata.formatTechnicalName(names[names.length - 1].replace(/_id$/, ''));
  }

  /** Libellés des champs propres au handler (alias « nature », « case_name »…). */
  private async handlerLabels(entity: string): Promise<Map<string, string>> {
    const handler = this.registry.getHandler(entity) as any;
    if (!handler?.getWriteableFieldsSchema) return new Map();
    try {
      const schema: Array<{ name: string; label: string }> = await handler.getWriteableFieldsSchema();
      return new Map(schema.map((field) => [field.name, field.label]));
    } catch {
      return new Map();
    }
  }

  private neverAutoCreate(): Set<string> {
    return new Set(['user', 'users', ...(this.projectConfig?.neverAutoCreate ?? [])]);
  }
}

/** Valeur vide ou égale à la valeur par défaut de la colonne : rangée sous « autres champs ». */
function isSecondary(column: ColumnMetadata | undefined, raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === '') return true;
  const fallback = column?.default;
  if (fallback === undefined || fallback === null || typeof fallback === 'function' || typeof fallback === 'object') return false;
  return String(fallback).toLowerCase() === String(raw).toLowerCase()
    || (typeof fallback === 'boolean' && String(Number(fallback)) === String(raw));
}

function scalarKind(column?: ColumnMetadata): PlanFieldDescriptor['kind'] {
  const type = String(column?.type ?? '').toLowerCase();
  if (['datetime', 'timestamp'].includes(type)) return 'datetime';
  if (type === 'date') return 'date';
  if (['int', 'integer', 'smallint', 'bigint', 'decimal', 'float', 'double', 'number'].includes(type)) return 'number';
  if (column?.type === Number) return 'number';
  return 'text';
}

/** Une option par valeur, la première l'emporte. */
function dedupe(options: PlanFieldOption[]): PlanFieldOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = JSON.stringify(option.value ?? null);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
