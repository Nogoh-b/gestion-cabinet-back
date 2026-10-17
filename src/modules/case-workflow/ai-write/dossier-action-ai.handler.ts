import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import {
  WriteableFieldSchema,
  ValidationResult,
} from 'src/core/ai-database/interface/entity-write-handler.interface';
import { AmbiguityException } from 'src/core/ai-database/write/ambiguity.exception';
import {
  comparableKey,
  parseLenientDate,
} from 'src/core/ai-database/write/lenient-values';
import {
  PlanCreatedRecord,
  WriteIntent,
} from 'src/core/ai-database/interface/write-intent.interface';
import { DossierActionService } from '../services/dossier-action.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { ActionLinkRole, DossierActionStatus } from '../case-workflow.enums';
import { ActionDefinition } from '../entities/action-catalog.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../entities/dossier-action.entity';
import {
  ActionLink,
  DEFAULT_LINK_ROLE,
  LINK_ENTITY,
  LINK_KINDS,
  LinkKind,
  dedupeLinks,
  readLinkInput,
  requirementFor,
  toLinkRole,
} from './action-links';

/** Clé interne : créations du plan transmises par execute() au handler. */
export const PLAN_CREATED = '__plan_created';

const LINK_LABEL: Record<LinkKind, string> = {
  documents: 'Document',
  audiences: 'Audience',
  previous_actions: 'Action précédente',
};

type Links = Record<LinkKind, ActionLink[]>;
const emptyLinks = (): Links => ({
  documents: [],
  audiences: [],
  previous_actions: [],
});

@Injectable()
export class DossierActionAiWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly actionService: DossierActionService,
  ) {
    super('dossier_actions', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    return [
      {
        name: 'dossier_id',
        label: 'Dossier',
        type: 'reference',
        required: false,
        referenceEntity: 'dossiers',
        description:
          'ID technique du dossier. Tu peux aussi fournir "dossier" avec le numéro (ex: DOS-2026-0018-649D) — résolution automatique sans création.',
        example: '1',
      },
      {
        name: 'dossier',
        label: 'Dossier (par numéro)',
        type: 'string',
        required: false,
        referenceEntity: 'dossiers',
        description:
          'Numéro de dossier (dossier_number). Le dossier doit déjà exister ; il ne sera JAMAIS créé automatiquement.',
        example: 'DOS-2026-0018-649D',
      },
      {
        name: 'definition_id',
        label: 'Définition d’action',
        type: 'reference',
        required: false,
        referenceEntity: 'case_action_definitions',
        description:
          'UUID de la définition. Tu peux aussi fournir definition_code / definition / label avec le code ou libellé.',
        example: 'SIGN_DOCUMENT',
      },
      {
        name: 'definition_code',
        label: 'Code définition',
        type: 'string',
        required: false,
        referenceEntity: 'case_action_definitions',
        description:
          'Code métier de la définition (ex: SIGN_DOCUMENT). La définition doit exister — aucune création automatique.',
        example: 'SIGN_DOCUMENT',
      },
      {
        name: 'definition',
        label: 'Définition (par code/libellé)',
        type: 'string',
        required: false,
        referenceEntity: 'case_action_definitions',
        description: 'Code ou libellé de la définition d’action.',
        example: 'Faire signer le document',
      },
      {
        name: 'title',
        label: 'Titre',
        type: 'string',
        required: false,
        description:
          'Titre lisible et éventuellement personnalisé. Par défaut reprend le libellé de la définition.',
        example: 'Faire signer le document',
      },
      {
        name: 'responsible_user_id',
        label: 'Responsable',
        type: 'reference',
        required: false,
        referenceEntity: 'user',
        description:
          'ID de l’utilisateur responsable. Tu peux aussi fournir responsible / responsible_user avec le nom.',
        example: '12',
      },
      {
        name: 'responsible',
        label: 'Responsable (par nom)',
        type: 'string',
        required: false,
        referenceEntity: 'user',
        description: 'Nom/prénom du responsable. Résolu via user, jamais créé.',
        example: 'Karima Bensalem',
      },
      {
        name: 'priority',
        label: 'Priorité',
        type: 'enum',
        required: false,
        enumValues: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
        description: 'Priorité opérationnelle.',
        example: 'NORMAL',
      },
      {
        name: 'planned_at',
        label: 'Date planifiée',
        type: 'date',
        required: false,
        description: 'Date prévue de réalisation (YYYY-MM-DD).',
        example: '{{today}}',
      },
      {
        name: 'due_at',
        label: 'Échéance',
        type: 'date',
        required: false,
        description:
          'Date limite. Si absente, calculée depuis default_due_days de la définition.',
        example: '2026-06-22',
      },
      {
        name: 'remind_at',
        label: 'Date de rappel',
        type: 'date',
        required: false,
        description: 'Doit être future et antérieure à due_at.',
        example: '2026-06-20',
      },
      {
        name: 'specific_data',
        label: 'Données spécifiques',
        type: 'string',
        required: false,
        description: 'JSON des valeurs propres au type d’action.',
        example: '{"analysis":"Risque faible"}',
      },
      {
        name: 'documents',
        label: 'Documents liés',
        type: 'string',
        required: false,
        description:
          'Documents du dossier utilisés par l’action (rôle INPUT, comme le formulaire). Liste d’IDs, de noms de fichier, ou "{{tempId.id}}" d’un document créé dans ce plan. Si la définition exige un document, le plus récent du dossier est relié automatiquement.',
        example: '["Contrat_de_bail.pdf"]',
      },
      {
        name: 'audiences',
        label: 'Audiences liées',
        type: 'string',
        required: false,
        description:
          'Audiences concernées (rôle INPUT). Liste d’IDs, de dates (« 12/11/2026 »), « prochaine », ou "{{tempId.id}}" d’une audience créée dans ce plan. Si la définition exige une audience, celle créée dans le plan, sinon la prochaine du dossier, est reliée automatiquement.',
        example: '["{{audience_1.id}}"]',
      },
      {
        name: 'previous_actions',
        label: 'Actions précédentes',
        type: 'string',
        required: false,
        description:
          'Actions dont celle-ci dépend (DEPENDS_ON). Liste d’IDs, de titres, ou "{{tempId.id}}" d’une action créée plus tôt dans ce plan (donne un tempId à chaque action). Par défaut, une action créée dans un plan dépend de l’action précédente du même dossier dans ce plan ; mets [] pour une action indépendante.',
        example: '["{{action_1.id}}"]',
      },
      {
        name: 'start_immediately',
        label: 'Démarrer immédiatement',
        type: 'boolean',
        required: false,
        description: 'Si true, l’action est créée en statut IN_PROGRESS.',
        example: 'false',
      },
    ];
  }

  /**
   * Transmet au handler les ressources créées plus tôt dans le plan, pour
   * relier l'action à l'audience, au document ou à l'action qui la précède.
   */
  async execute(intent: WriteIntent, userId: string): Promise<WriteResult> {
    return super.execute(
      {
        ...intent,
        fields: { ...intent.fields, [PLAN_CREATED]: intent.planCreated ?? [] },
      },
      userId,
    );
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    if (operation === 'INSERT') {
      if (!fields.dossier_id && !fields.dossier) {
        errors.push(
          'Le dossier est requis : fournir dossier_id ou dossier (numéro). Le dossier doit exister.',
        );
      }
      if (!fields.definition_id && !fields.definition && !fields.definition_code && !fields.definitionCode) {
        errors.push(
          'La définition est requise : fournir definition_id ou definition_code/definition (code ou libellé).',
        );
      }
    }
    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  async resolveDependencies(
    fields: Record<string, any>,
    userId: string,
    _createdEntities?: Map<string, any>,
    config?: import('src/core/ai-database/write/entity-resolver.service').ResolveConfig,
  ): Promise<Record<string, any>> {
    const resolved: Record<string, any> = { ...fields };

    // ── Dossier : jamais créé, résolution stricte par dossier_number ou id ──
    if (!resolved.dossier_id && resolved.dossier) {
      const term = String(resolved.dossier).trim();
      if (BaseWriteHandler.isAlreadyId(term) && /^\d+$/.test(term)) {
        resolved.dossier_id = Number(term);
      } else {
        // Tenter par dossier_number exact d'abord
        const dossierRepo = this.dataSource.getRepository('dossiers');
        let dossier: any = null;
        try {
          dossier = await dossierRepo.findOne({
            where: { dossier_number: term } as any,
          });
        } catch {
          // ignore
        }
        if (dossier) {
          resolved.dossier_id = dossier.id;
        } else {
          // Fallback : resolveAnyEntity sans création
          const r = await this.entityResolver.resolveAnyEntity(
            'dossiers',
            term,
            { mode: 'strict' as any, minScore: 40, ambiguityGap: 15, ...config },
          );
          if (r.found && r.best && !r.ambiguous) {
            resolved.dossier_id = r.best.id;
            this.logger.log(`✅ dossier "${term}" → ${resolved.dossier_id}`);
          } else {
            const candidates = (r.candidates || []).slice(0, 10).map((c: any) => ({
              id: c.entity.id,
              label: c.matchedOn,
              score: c.score,
              data: c.entity,
            }));
            throw new AmbiguityException(
              'dossiers',
              'dossier',
              term,
              candidates,
              -1,
              this.entityName,
            );
          }
        }
      }
      delete resolved.dossier;
    }

    // ── Définition : jamais créée, résolution stricte ──
    const defTermRaw =
      resolved.definition_code ??
      resolved.definitionCode ??
      resolved.definition ??
      resolved.label_definition;
    if (!resolved.definition_id && defTermRaw) {
      const term = String(defTermRaw).trim();
      if (BaseWriteHandler.isAlreadyId(term)) {
        resolved.definition_id = term;
      } else {
        const r = await this.entityResolver.resolveAnyEntity(
          'case_action_definitions',
          term,
          { mode: 'strict' as any, minScore: 40, ambiguityGap: 15, ...config },
        );
        if (r.found && r.best && !r.ambiguous) {
          resolved.definition_id = r.best.id;
          this.logger.log(`✅ definition "${term}" → ${resolved.definition_id}`);
        } else {
          const candidates = (r.candidates || []).slice(0, 10).map((c: any) => ({
            id: c.entity.id,
            label: c.matchedOn,
            score: c.score,
            data: c.entity,
          }));
          throw new AmbiguityException(
            'case_action_definitions',
            'definition',
            term,
            candidates,
            -1,
            this.entityName,
          );
        }
      }
      delete resolved.definition_code;
      delete resolved.definitionCode;
      delete resolved.definition;
      delete resolved.label_definition;
    }
    if (resolved.definition !== undefined) delete resolved.definition;
    if (resolved.definition_code !== undefined) delete resolved.definition_code;

    // ── Responsable : résolution sans création (employee/user jamais auto-créés) ──
    if (!resolved.responsible_user_id && (resolved.responsible ?? resolved.responsible_user)) {
      const term = String(resolved.responsible ?? resolved.responsible_user).trim();
      if (BaseWriteHandler.isAlreadyId(term)) {
        resolved.responsible_user_id = Number(term);
      } else {
        // employee → user via PK partagée : chercher via user
        const r = await this.entityResolver.resolveAnyEntity(
          'user',
          term,
          { mode: 'strict' as any, minScore: 40, ambiguityGap: 15, ...config },
        );
        if (r.found && r.best && !r.ambiguous) {
          resolved.responsible_user_id = r.best.id;
          this.logger.log(`✅ responsible "${term}" → ${resolved.responsible_user_id}`);
        } else {
          // Non bloquant si aucun match et champ optionnel : on laisse le service mettre actor par défaut
          const candidates = (r.candidates || []).slice(0, 10);
          if (candidates.length > 0) {
            throw new AmbiguityException(
              'user',
              'responsible',
              term,
              candidates.map((c: any) => ({
                id: c.entity.id,
                label: c.matchedOn,
                score: c.score,
                data: c.entity,
              })),
              -1,
              this.entityName,
            );
          } else {
            this.logger.warn(`⚠️ responsible "${term}" introuvable — utilisation du demandeur par défaut`);
            delete resolved.responsible;
            delete resolved.responsible_user;
          }
        }
      }
      delete resolved.responsible;
      delete resolved.responsible_user;
    }

    // Nettoyer les alias restants
    if (resolved.dossier !== undefined) delete resolved.dossier;

    // specific_data : si string JSON, parser
    if (typeof resolved.specific_data === 'string' && resolved.specific_data.trim()) {
      try {
        resolved.specific_data = JSON.parse(resolved.specific_data);
      } catch {
        // laisser tel quel
      }
    }

    // Statut en toutes lettres traduit avant la conversion générique des enums.
    if (resolved.status) resolved.status = this.toActionStatus(resolved.status);

    // Normaliser start_immediately en boolean
    if (resolved.start_immediately !== undefined) {
      resolved.start_immediately = Boolean(
        resolved.start_immediately === true ||
          resolved.start_immediately === 'true' ||
          resolved.start_immediately === 1 ||
          resolved.start_immediately === '1',
      );
    }

    return resolved;
  }

  protected async doInsert(
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const dossierId = Number(fields.dossier_id);
    if (!Number.isFinite(dossierId)) {
      throw new Error('dossier_id invalide ou manquant');
    }
    const dto: any = {
      definition_id: String(fields.definition_id),
      title: fields.title?.toString().trim() || undefined,
      responsible_user_id:
        fields.responsible_user_id !== undefined
          ? Number(fields.responsible_user_id)
          : undefined,
      priority: fields.priority || undefined,
      planned_at: fields.planned_at || undefined,
      due_at: fields.due_at || undefined,
      remind_at: fields.remind_at || undefined,
      specific_data: fields.specific_data ?? undefined,
      start_immediately: fields.start_immediately === true ? true : undefined,
    };
    // Nettoyer undefined pour que le service applique ses defaults
    Object.keys(dto).forEach((k) => dto[k] === undefined && delete dto[k]);

    // Liens vers les ressources, comme le formulaire : ceux demandés par le
    // plan, l'action précédente du plan, puis ce qu'exige la définition.
    const notes: string[] = [];
    const planCreated: PlanCreatedRecord[] = fields[PLAN_CREATED] ?? [];
    const requested = await this.resolveRequestedLinks(dossierId, fields, notes);
    const links: Links = { ...emptyLinks(), ...requested };
    if (requested.previous_actions === undefined) {
      const previous = this.planCreatedOf(
        'previous_actions',
        dossierId,
        planCreated,
      )[0];
      if (previous) {
        links.previous_actions.push({
          id: String(previous.id),
          role: ActionLinkRole.DEPENDS_ON,
        });
      }
    }
    await this.fillRequiredLinks({
      definitionId: dto.definition_id,
      dossierId,
      links,
      existing: emptyLinks(),
      planCreated,
      notes,
    });
    for (const kind of LINK_KINDS) {
      if (links[kind].length) dto[kind] = dedupeLinks(links[kind]);
    }

    const idempotencyKey =
      fields.idempotency_key?.toString().trim() ||
      `AI:${randomUUID()}:${Date.now()}`;
    const actorId = Number(userId);
    const action = await this.actionService.create(
      dossierId,
      dto,
      idempotencyKey,
      actorId,
      dto.start_immediately === true,
    );
    const linked = this.describeLinks(links);
    return {
      success: true,
      operation: 'INSERT',
      entityId: action.id,
      affected: 1,
      data: action,
      message:
        `Action "${action.title}" créée dans le dossier #${dossierId}` +
        (linked ? ` — liée à : ${linked}` : '') +
        (notes.length ? ` (${notes.join(' ; ')})` : ''),
    };
  }

  // ── Liens vers les ressources ─────────────────────────────────────────────

  /** Liens demandés par le plan, résolus dans le dossier (introuvable = noté). */
  private async resolveRequestedLinks(
    dossierId: number,
    fields: Record<string, any>,
    notes: string[],
  ): Promise<Partial<Links>> {
    const out: Partial<Links> = {};
    for (const kind of LINK_KINDS) {
      const raw = readLinkInput(fields, kind);
      if (raw === undefined) continue;
      const links: ActionLink[] = [];
      for (const item of raw) {
        const id = await this.findLinkTarget(kind, dossierId, item.ref);
        if (id === null) {
          notes.push(
            `${LINK_LABEL[kind]} « ${item.ref} » introuvable dans ce dossier : non reliée`,
          );
          continue;
        }
        links.push({ id, role: toLinkRole(item.role, kind) });
      }
      out[kind] = dedupeLinks(links);
    }
    return out;
  }

  /** Id d'une ressource du dossier désignée par id, nom, titre ou date. */
  private async findLinkTarget(
    kind: LinkKind,
    dossierId: number,
    ref: string,
  ): Promise<number | string | null> {
    const rows = await this.dossierResources(kind, dossierId);
    const exactId = rows.find((row) => String(row.id) === ref);
    if (exactId) return exactId.id;
    if (kind === 'audiences') {
      if (/prochain|suivant|next/.test(comparableKey(ref))) {
        return this.upcomingAudiences(rows)[0]?.id ?? null;
      }
      const date = parseLenientDate(ref);
      const day = date instanceof Date ? this.dayOf(date) : date?.slice(0, 10);
      if (!day) return null;
      return (
        rows.find((row) => this.dayOf(row.audience_date) === day)?.id ?? null
      );
    }
    const key = comparableKey(ref);
    if (!key) return null;
    const texts = (row: any): string[] =>
      (kind === 'documents'
        ? [row.name]
        : [row.title, row.definition_label, row.definition_code]
      ).map(comparableKey);
    const exact = rows.find((row) => texts(row).includes(key));
    const partial = rows.find((row) =>
      texts(row).some(
        (text) => text && (text.includes(key) || key.includes(text)),
      ),
    );
    return (exact ?? partial)?.id ?? null;
  }

  /** Ressources du dossier, les plus récentes d'abord. */
  private async dossierResources(
    kind: LinkKind,
    dossierId: number,
  ): Promise<any[]> {
    const tenantId = getCurrentTenantId();
    if (kind === 'documents') {
      return this.dataSource.getRepository(DocumentCustomer).find({
        where: { tenant_id: tenantId, dossier_id: dossierId } as any,
        order: { id: 'DESC' },
      });
    }
    if (kind === 'audiences') {
      return this.dataSource.getRepository(Audience).find({
        where: { tenant_id: tenantId, dossier_id: String(dossierId) } as any,
        order: { audience_date: 'DESC' },
      });
    }
    return this.dataSource.getRepository(DossierAction).find({
      where: { tenant_id: tenantId, dossier_id: dossierId },
      order: { created_at: 'DESC' } as any,
    });
  }

  /** Audiences à venir, la plus proche d'abord. */
  private upcomingAudiences(rows: any[]): any[] {
    const today = this.dayOf(new Date()) ?? '';
    return rows
      .filter((row) => (this.dayOf(row.audience_date) ?? '') >= today)
      .sort((a, b) =>
        String(this.dayOf(a.audience_date)).localeCompare(
          String(this.dayOf(b.audience_date)),
        ),
      );
  }

  /** Jour local AAAA-MM-JJ (les colonnes DATE arrivent en heure locale). */
  private dayOf(value: unknown): string | undefined {
    if (value instanceof Date) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return typeof value === 'string' ? value.slice(0, 10) : undefined;
  }

  /** Créations du plan de ce type pour ce dossier, la plus récente d'abord. */
  private planCreatedOf(
    kind: LinkKind,
    dossierId: number,
    planCreated: PlanCreatedRecord[],
  ): PlanCreatedRecord[] {
    return planCreated
      .filter(
        (record) =>
          record.entity === LINK_ENTITY[kind] &&
          Number(record.data?.dossier_id) === dossierId,
      )
      .reverse();
  }

  /**
   * Complète les liens qu'exige la définition (`required_relations`) : d'abord
   * avec les ressources créées dans le plan, puis avec celles du dossier
   * (audience à venir sinon la plus récente, document le plus récent, action
   * la plus récente). Sans candidat, une note prévient l'utilisateur.
   */
  private async fillRequiredLinks(params: {
    definitionId?: string;
    dossierId: number;
    links: Links;
    existing: Links;
    planCreated: PlanCreatedRecord[];
    notes: string[];
    excludeActionId?: string;
    kinds?: LinkKind[];
  }): Promise<void> {
    const { definitionId, dossierId, links, existing, planCreated, notes } =
      params;
    if (!definitionId) return;
    const definition = await this.dataSource
      .getRepository(ActionDefinition)
      .findOne({
        where: { id: definitionId, tenant_id: getCurrentTenantId() },
      });
    for (const kind of params.kinds ?? LINK_KINDS) {
      const requirement = requirementFor(definition?.required_relations, kind);
      if (!requirement) continue;
      const current = [...existing[kind], ...links[kind]];
      const role =
        (requirement.roles[0] as ActionLinkRole) ?? DEFAULT_LINK_ROLE[kind];
      const roleMissing =
        requirement.roles.length > 0 &&
        !current.some((link) => requirement.roles.includes(link.role));
      const missing = Math.max(
        requirement.min - current.length,
        roleMissing ? 1 : 0,
      );
      if (missing <= 0) continue;

      const taken = new Set(current.map((link) => String(link.id)));
      const fromPlan = this.planCreatedOf(kind, dossierId, planCreated).map(
        (record) => record.id,
      );
      const rows = await this.dossierResources(kind, dossierId);
      const fromDossier =
        kind === 'audiences'
          ? [...this.upcomingAudiences(rows), ...rows].map((row) => row.id)
          : rows
              .filter(
                (row) =>
                  !(kind === 'documents' && row.is_confidential) &&
                  !(
                    kind === 'previous_actions' &&
                    row.status === DossierActionStatus.CANCELLED
                  ),
              )
              .map((row) => row.id);
      const candidates = [...fromPlan, ...fromDossier].filter((id) => {
        const key = String(id);
        if (taken.has(key) || key === params.excludeActionId) return false;
        taken.add(key);
        return true;
      });
      for (const id of candidates.slice(0, missing)) {
        links[kind].push({ id, role });
      }
      if (candidates.length < missing) {
        notes.push(
          `la définition demande ${requirement.min} ${LINK_LABEL[kind].toLowerCase()}(s) liée(s) : aucune disponible dans le dossier, à relier avant la clôture`,
        );
      }
    }
  }

  /** Liens déjà enregistrés pour une action. */
  private async currentLinks(actionId: string): Promise<Links> {
    const where = { tenant_id: getCurrentTenantId(), action_id: actionId };
    const [documents, audiences, relations] = await Promise.all([
      this.dataSource.getRepository(DossierActionDocumentLink).find({ where }),
      this.dataSource.getRepository(DossierActionAudienceLink).find({ where }),
      this.dataSource.getRepository(DossierActionRelation).find({ where }),
    ]);
    return {
      documents: documents.map((link) => ({
        id: link.document_id,
        role: link.role,
      })),
      audiences: audiences.map((link) => ({
        id: link.audience_id,
        role: link.role,
      })),
      previous_actions: relations.map((link) => ({
        id: link.related_action_id,
        role: link.role,
      })),
    };
  }

  /** Résumé lisible des liens créés, pour le message de résultat. */
  private describeLinks(links: Partial<Links>): string {
    return LINK_KINDS.filter((kind) => links[kind]?.length)
      .map((kind) => {
        const count = links[kind]!.length;
        return `${count} ${LINK_LABEL[kind].toLowerCase()}${count > 1 ? 's' : ''}`;
      })
      .join(', ');
  }

  /** « terminée », « en cours », « suspendue »… → statut technique. */
  private toActionStatus(value: any): string {
    const key = comparableKey(value);
    if (/^(encours|demarr|commenc|start|inprogress|lanc)/.test(key))
      return 'IN_PROGRESS';
    if (/^(suspend|enattente|pause|hold|onhold|bloqu)/.test(key))
      return 'ON_HOLD';
    if (/^(annul|cancel|abandon)/.test(key)) return 'CANCELLED';
    if (/^(termin|realis|fait|done|complet|clotur|achev|finie?)/.test(key))
      return 'COMPLETED';
    return String(value).trim().toUpperCase();
  }

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const tenantId = getCurrentTenantId();
    const repo = this.dataSource.getRepository('dossier_actions');
    const existing: any = await repo.findOne({
      where: { id: String(entityId), tenant_id: tenantId } as any,
    });
    if (!existing) throw new Error(`Action ${entityId} introuvable`);
    let expected_version =
      fields.expected_version !== undefined
        ? Number(fields.expected_version)
        : existing.lock_version;

    // Liens demandés : AJOUTÉS à ceux déjà enregistrés (updateDetails remplace
    // les liens d'entrée, on lui renvoie donc la liste fusionnée).
    const actionId = String(entityId);
    const dossierId = Number(existing.dossier_id);
    const notes: string[] = [];
    const planCreated: PlanCreatedRecord[] = fields[PLAN_CREATED] ?? [];
    const requested = await this.resolveRequestedLinks(dossierId, fields, notes);
    const current = await this.currentLinks(actionId);
    const target = fields.status ? this.toActionStatus(fields.status) : null;

    // Clôture : la définition peut exiger des liens (ex. une audience) ; on
    // complète avec les ressources du plan puis du dossier plutôt qu'échouer.
    const completionLinks: Links = {
      ...emptyLinks(),
      documents: requested.documents ?? [],
      audiences: requested.audiences ?? [],
      previous_actions: requested.previous_actions ?? [],
    };
    if (target === 'COMPLETED') {
      await this.fillRequiredLinks({
        definitionId: existing.definition_id,
        dossierId,
        links: completionLinks,
        existing: current,
        planCreated,
        notes,
        excludeActionId: actionId,
      });
    }
    const merge = (kind: LinkKind, role: ActionLinkRole, added: ActionLink[]) =>
      dedupeLinks([
        ...current[kind].filter((link) => link.role === role),
        ...added.map((link) => ({ id: link.id, role })),
      ]);
    const linkDetails: Record<string, ActionLink[]> = {};
    if (target !== 'COMPLETED') {
      if (requested.documents)
        linkDetails.documents = merge('documents', ActionLinkRole.INPUT, requested.documents);
      if (requested.audiences)
        linkDetails.audiences = merge('audiences', ActionLinkRole.INPUT, requested.audiences);
    }
    const dependencies =
      target === 'COMPLETED' ? completionLinks.previous_actions : requested.previous_actions;
    if (dependencies?.length || requested.previous_actions) {
      linkDetails.previous_actions = merge(
        'previous_actions',
        ActionLinkRole.DEPENDS_ON,
        dependencies ?? [],
      );
    }
    const linkSuffix = () => {
      const linked = this.describeLinks({
        documents: target === 'COMPLETED' ? completionLinks.documents : requested.documents,
        audiences: target === 'COMPLETED' ? completionLinks.audiences : requested.audiences,
        previous_actions: dependencies,
      });
      return (
        (linked ? ` — liée à : ${linked}` : '') +
        (notes.length ? ` (${notes.join(' ; ')})` : '')
      );
    };

    // Si seuls des détails sont modifiés
    const dto: any = {
      expected_version,
      specific_data: fields.specific_data ?? undefined,
    };
    if (fields.title !== undefined) {
      // title n'est pas dans UpdateDossierActionDetailsDto ; on le met via specific_data ou on l'ignore
      // On tente un update direct du titre si fourni (non standard mais utile pour l'IA)
      dto.specific_data = { ...(dto.specific_data ?? {}), _title: fields.title };
    }
    // Nettoyer
    if (dto.specific_data === undefined) delete dto.specific_data;

    // Si un changement de statut est demandé via "status", déléguer à transition
    if (target) {
      const key = `AI:${randomUUID()}`;
      const actorId = Number(userId);
      // Les liens se posent avant la transition (version relue ensuite).
      if (Object.keys(linkDetails).length && this.isTransition(target)) {
        const linked = await this.actionService.updateDetails(
          actionId,
          { expected_version, ...linkDetails } as any,
          `${key}:links`,
          actorId,
        );
        expected_version = linked.lock_version;
      }
      const map: Record<string, () => Promise<any>> = {
        IN_PROGRESS: () =>
          this.actionService.start(String(entityId), { expected_version, reason: fields.reason }, key, actorId),
        ON_HOLD: () =>
          this.actionService.hold(String(entityId), { expected_version, reason: fields.reason }, key, actorId),
        CANCELLED: () =>
          this.actionService.cancel(String(entityId), { expected_version, reason: fields.reason }, key, actorId),
        COMPLETED: () =>
          this.actionService.complete(
            String(entityId),
            {
              expected_version,
              result_code: fields.result_code || 'COMPLETED',
              result_notes: fields.result_notes,
              duration_minutes: fields.duration_minutes,
              specific_data: fields.specific_data,
              billing_decision: fields.billing_decision,
              billing_reason: fields.billing_reason,
              ...(completionLinks.documents.length && {
                documents: dedupeLinks(completionLinks.documents),
              }),
              ...(completionLinks.audiences.length && {
                audiences: dedupeLinks(completionLinks.audiences),
              }),
            } as any,
            key,
            actorId,
          ),
      };
      if (map[target]) {
        const updated = await map[target]();
        return {
          success: true,
          operation: 'UPDATE',
          entityId: updated.id,
          affected: 1,
          data: updated,
          message: `Action ${updated.id} → ${target}${linkSuffix()}`,
        };
      }
    }

    const key = `AI:${randomUUID()}`;
    const actorId = Number(userId);
    const updated = await this.actionService.updateDetails(
      String(entityId),
      { ...dto, ...linkDetails },
      key,
      actorId,
    );
    // Si un titre a été fourni, le mettre à jour directement (hors DTO standard)
    if (fields.title && updated.title !== fields.title) {
      updated.title = String(fields.title).trim();
      await repo.save(updated);
    }
    return {
      success: true,
      operation: 'UPDATE',
      entityId: updated.id,
      affected: 1,
      data: updated,
      message: `Action "${updated.title}" mise à jour${linkSuffix()}`,
    };
  }

  private isTransition(target: string): boolean {
    return ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED', 'COMPLETED'].includes(target);
  }
}
