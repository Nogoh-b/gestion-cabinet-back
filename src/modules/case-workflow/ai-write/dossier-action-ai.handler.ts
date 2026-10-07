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
import { DossierActionService } from '../services/dossier-action.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

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
        name: 'start_immediately',
        label: 'Démarrer immédiatement',
        type: 'boolean',
        required: false,
        description: 'Si true, l’action est créée en statut IN_PROGRESS.',
        example: 'false',
      },
    ];
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
    return {
      success: true,
      operation: 'INSERT',
      entityId: action.id,
      affected: 1,
      data: action,
      message: `Action "${action.title}" créée dans le dossier #${dossierId}`,
    };
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
    const expected_version =
      fields.expected_version !== undefined
        ? Number(fields.expected_version)
        : existing.lock_version;

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
    if (fields.status) {
      const target = String(fields.status).toUpperCase();
      const key = `AI:${randomUUID()}`;
      const actorId = Number(userId);
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
          message: `Action ${updated.id} → ${target}`,
        };
      }
    }

    const key = `AI:${randomUUID()}`;
    const actorId = Number(userId);
    const updated = await this.actionService.updateDetails(
      String(entityId),
      dto,
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
      message: `Action "${updated.title}" mise à jour`,
    };
  }
}
