// src/modules/mail-template/template-context.service.ts
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Audience } from '../audiences/entities/audience.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Facture } from '../facture/entities/facture.entity';
import { User } from '../iam/user/entities/user.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { buildEntityMailContext } from './mail-variables';
import {
  actionRows,
  audienceRows,
  diligenceRows,
  documentRows,
  dossierRows,
  invoiceRows,
  mergeMissing,
  nextAudience,
  paymentRows,
  TEMPLATE_ENTITY_TYPES,
  type TemplateEntityType,
} from './template-context';

export interface TemplateContextOptions {
  /** Utilisateur qui remplit le modèle : listes limitées à ses droits (aucun : envoi automatique). */
  user?: any;
  /** Destinataire d'un mail : un client ne reçoit ni actions, ni diligences, ni pièces internes. */
  recipient?: 'client' | 'employee';
}

/**
 * Contexte complet d'un modèle (mail ou PDF) pour une fiche : les variables
 * de la fiche (`buildEntityMailContext`) et, autour d'elle, les listes et
 * totaux de son dossier (factures, paiements, audiences, actions, diligences,
 * pièces), du client (dossiers, factures) ou de la facture (paiements).
 * Chaque liste demande son droit de lecture ; le cabinet courant filtre tout.
 */
@Injectable()
export class TemplateContextService {
  private readonly logger = new Logger(TemplateContextService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly permissions?: AiDatabasePermissionService,
  ) {}

  static isEntityType(type: unknown): type is TemplateEntityType {
    return (TEMPLATE_ENTITY_TYPES as readonly string[]).includes(String(type));
  }

  async build(type: TemplateEntityType, id: string | number, options: TemplateContextOptions = {}): Promise<Record<string, any>> {
    const { resource, dossier, client } = await this.load(type, id);
    if (!resource) throw new NotFoundException('Fiche introuvable');
    const tenantId = getCurrentTenantId();
    const cabinet = tenantId ? await this.dataSource.getRepository(Cabinet).findOne({ where: { id: tenantId } as any }) : null;
    const base = buildEntityMailContext({
      cabinet,
      dossier,
      resourceType: type,
      resource: { ...resource, ...(client && !resource.client && { client }) },
    });
    return mergeMissing(base, await this.lists(type, resource, dossier, client, options));
  }

  /**
   * Contexte d'un mail complété avec les listes de sa fiche (`entity` du
   * contexte) ; inchangé si la fiche est inconnue ou illisible.
   */
  async enrichMailContext(context: Record<string, any>): Promise<Record<string, any>> {
    const entity = context?.entity;
    if (!entity || !TemplateContextService.isEntityType(entity.type) || entity.id === undefined || entity.id === null) return context;
    try {
      const recipient = context.recipient_type === 'client' ? 'client' : 'employee';
      return mergeMissing(context, await this.build(entity.type, entity.id, { recipient }));
    } catch (error) {
      this.logger.warn(`Listes du modèle non chargées (${entity.type} ${entity.id}) : ${(error as Error)?.message ?? error}`);
      return context;
    }
  }

  private async load(type: TemplateEntityType, id: string | number): Promise<{ resource: any; dossier: Dossier | null; client: Customer | null }> {
    const repo = <T extends object>(entity: new () => T) => this.dataSource.getRepository<T>(entity);
    const dossierOf = async (dossierId: unknown) =>
      dossierId ? repo(Dossier).findOne({ where: { id: Number(dossierId) } as any, relations: ['client', 'jurisdiction', 'lawyer'] }) : null;
    let resource: any = null;
    let dossier: Dossier | null = null;
    switch (type) {
      case 'dossier':
        resource = dossier = await dossierOf(id);
        break;
      case 'client':
        resource = await repo(Customer).findOne({ where: { id: Number(id) } as any });
        return { resource, dossier: null, client: resource };
      case 'facture':
        resource = await repo(Facture).findOne({ where: { id: String(id) } as any, relations: ['client'] });
        dossier = await dossierOf(resource?.dossier_id);
        return { resource, dossier, client: resource?.client ?? dossier?.client ?? null };
      case 'paiement':
        resource = await repo(Paiement).findOne({ where: { id: String(id) } as any, relations: ['facture', 'facture.client'] });
        dossier = await dossierOf(resource?.facture?.dossier_id);
        return { resource, dossier, client: resource?.facture?.client ?? dossier?.client ?? null };
      case 'audience':
        resource = await repo(Audience).findOne({ where: { id: Number(id) } as any, relations: ['jurisdiction', 'audience_type'] });
        dossier = await dossierOf(resource?.dossier_id);
        break;
      case 'diligence':
        resource = await repo(Diligence).findOne({ where: { id: Number(id) } as any, relations: ['assigned_lawyer'] });
        dossier = await dossierOf(resource?.dossier_id);
        break;
      case 'document':
        resource = await repo(DocumentCustomer).findOne({ where: { id: Number(id) } as any, relations: ['document_type'] });
        dossier = await dossierOf(resource?.dossier_id);
        break;
      case 'action':
        resource = await repo(DossierAction).findOne({ where: { id: String(id) } as any });
        dossier = await dossierOf(resource?.dossier_id);
        break;
    }
    return { resource, dossier, client: dossier?.client ?? null };
  }

  private async can(user: any, code: string): Promise<boolean> {
    return !this.permissions || !user
      || (await this.permissions.missingPermissions(user, [code]).catch(() => [code])).length === 0;
  }

  private async lists(
    type: TemplateEntityType,
    resource: any,
    dossier: Dossier | null,
    client: Customer | null,
    { user, recipient }: TemplateContextOptions,
  ): Promise<Record<string, any>> {
    const repo = <T extends object>(entity: new () => T) => this.dataSource.getRepository<T>(entity);
    const internal = recipient !== 'client';
    const [factures, audiences, actions, diligences, documents, dossiers] = await Promise.all([
      this.can(user, 'view_factures'),
      this.can(user, 'view_audiences'),
      this.can(user, 'view_dossier_actions').then((ok) => ok && internal),
      this.can(user, 'view_diligences').then((ok) => ok && internal),
      this.can(user, 'view_documents').then((ok) => ok && internal),
      this.can(user, 'view_dossiers'),
    ]);
    const out: Record<string, any> = {};
    const none = <T>() => [] as T[];

    if (dossier) {
      const where = { dossier_id: dossier.id } as any;
      const [invoices, hearings, steps, tasks, pieces] = await Promise.all([
        factures ? repo(Facture).find({ where, relations: ['paiements'] }).catch(none<Facture>) : none<Facture>(),
        audiences ? repo(Audience).find({ where: { dossier_id: String(dossier.id) } as any, relations: ['jurisdiction', 'audience_type'] }).catch(none<Audience>) : none<Audience>(),
        actions ? repo(DossierAction).find({ where }).catch(none<DossierAction>) : none<DossierAction>(),
        diligences ? repo(Diligence).find({ where, relations: ['assigned_lawyer'] }).catch(none<Diligence>) : none<Diligence>(),
        documents ? repo(DocumentCustomer).find({ where, relations: ['document_type'] }).catch(none<DocumentCustomer>) : none<DocumentCustomer>(),
      ]);
      const responsibles = [...new Set(steps.map((step) => Number(step.responsible_user_id)).filter(Boolean))];
      const users = responsibles.length
        ? new Map((await repo(User).find({ where: { id: In(responsibles) } as any }).catch(none<User>)).map((item) => [Number(item.id), item]))
        : new Map();
      const billing = invoiceRows(invoices);
      const actionList = actionRows(steps, users);
      const diligenceList = diligenceRows(tasks);
      const documentList = documentRows(pieces);
      out.dossier = {
        ...(factures && {
          factures: billing.rows,
          paiements: paymentRows(invoices.flatMap((invoice) => (invoice.paiements ?? []).map((payment) => ({ ...payment, facture: invoice })))),
          ...billing.totals,
        }),
        ...(audiences && { audiences: audienceRows(hearings), nb_audiences: String(hearings.length), prochaine_audience: nextAudience(hearings) }),
        ...(actions && { actions: actionList, nb_actions: String(actionList.length) }),
        ...(diligences && { diligences: diligenceList, nb_diligences: String(diligenceList.length) }),
        ...(documents && { documents: documentList, nb_documents: String(documentList.length) }),
      };
    }

    if (type === 'client' && client) {
      const where = { client_id: client.id } as any;
      const [cases, invoices] = await Promise.all([
        dossiers ? repo(Dossier).find({ where }).catch(none<Dossier>) : none<Dossier>(),
        factures ? repo(Facture).find({ where, relations: ['paiements'] }).catch(none<Facture>) : none<Facture>(),
      ]);
      const billing = invoiceRows(invoices);
      out.client = {
        ...(dossiers && { dossiers: dossierRows(cases), nb_dossiers: String(cases.length) }),
        ...(factures && { factures: billing.rows, ...billing.totals }),
      };
    }

    if (type === 'facture' && factures) {
      const payments = await repo(Paiement).find({ where: { facture: { id: resource.id } } as any }).catch(none<Paiement>);
      out.facture = { paiements: paymentRows(payments.map((payment) => ({ ...payment, facture: resource }))) };
    }
    return out;
  }
}
