import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from '../entities/document-customer.entity';
import { DOCUMENT_REVIEWED_EVENT } from '../document-customer.service';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';

/**
 * Subscriber métier pour les documents clients.
 *
 * Événement émis :
 *  - DOCUMENT_UPLOADED → quand un document est attaché à un dossier
 *    Le client est notifié uniquement si la case est cochée
 *    (sinon le document peut être un brouillon interne).
 */
@Injectable()
export class DocumentCustomerSubscriber extends NotifiableSubscriber<DocumentCustomer> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return DocumentCustomer;
  }

  protected async onAfterCreate(
    entity: DocumentCustomer,
    event: InsertEvent<DocumentCustomer>,
  ): Promise<void> {
    // Recharger pour récupérer dossier + client + lawyer
    const doc = await this.load(entity.id, event).catch(() => null);
    if (!doc) return;

    const dossier: any = doc.dossier;
    const client: any = dossier?.client ?? doc.customer;
    const notifyClient = this.resolveTransientBoolean(
      'notify_client',
      entity,
      doc as any,
    );
    this.emitWorkflowSourceEvent(doc);

    // Dépôt depuis le portail client : le cabinet est averti (avocat du dossier
    // et admins) ; le client n'a pas à être notifié de son propre envoi.
    if (this.isClientPortalDocument(doc)) {
      await this.notify({
        event: NotifiableEvent.CLIENT_DOCUMENT_UPLOADED,
        title: `Document déposé par ${this.clientLabel(client)}`,
        content: dossier
          ? `« ${doc.name} » — dossier ${dossier.dossier_number} (à valider)`
          : `« ${doc.name} » (à valider)`,
        link: dossier ? `/dossiers/${dossier.id}/documents` : `/documents`,
        audience: { lawyer_id: dossier?.lawyer_id ?? null },
        entity: { type: 'document', id: doc.id },
      });
      return;
    }

    this.logger.log(
      `📢 Document uploadé | id=${doc.id} | name="${doc.name}" | dossier=${dossier?.dossier_number ?? '?'} | notify_client=${notifyClient}`,
    );

    await this.notify({
      event: NotifiableEvent.DOCUMENT_UPLOADED,
      title: `Nouveau document — ${doc.name}`,
      content: dossier
        ? `Document ajouté au dossier ${dossier.dossier_number}`
        : `Nouveau document partagé`,
      link: dossier ? `/dossiers/${dossier.id}/documents` : `/documents`,
      audience: {
        client: {
          user_id: client?.user_id,
          email: client?.email,
          notify: notifyClient,
        },
        lawyer_id: dossier?.lawyer_id ?? null,
      },
      entity: { type: 'document', id: doc.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'document',
        resource: doc as any,
      }),
    });
  }

  protected async onAfterUpdate(
    entity: Partial<DocumentCustomer>,
    event: UpdateEvent<DocumentCustomer>,
  ): Promise<void> {
    const id = entity.id ?? event.databaseEntity?.id;
    if (!id) return;
    const doc = await this.load(id, event).catch(() => null);
    if (doc) this.emitWorkflowSourceEvent(doc);
  }

  /**
   * Le cabinet a validé ou refusé un document déposé par le client : le client
   * en est informé (application + e-mail selon ses préférences).
   */
  @OnEvent(DOCUMENT_REVIEWED_EVENT, { async: true })
  async onDocumentReviewed(payload: {
    documentId: number;
    status: DocumentCustomerStatus;
  }): Promise<void> {
    try {
      const doc = await this.load(payload.documentId).catch(() => null);
      if (!doc || !this.isClientPortalDocument(doc)) return;

      const dossier: any = doc.dossier;
      const client: any = dossier?.client ?? doc.customer;
      const accepted = payload.status === DocumentCustomerStatus.ACCEPTED;

      await this.notify({
        event: accepted
          ? NotifiableEvent.DOCUMENT_VALIDATED
          : NotifiableEvent.DOCUMENT_REFUSED,
        title: accepted
          ? `Document validé — ${doc.name}`
          : `Document refusé — ${doc.name}`,
        content: accepted
          ? `Votre document a été validé par le cabinet${dossier ? ` (dossier ${dossier.dossier_number})` : ''}.`
          : `Votre document n'a pas été accepté par le cabinet${dossier ? ` (dossier ${dossier.dossier_number})` : ''}. Vous pouvez en déposer un nouveau.`,
        link: dossier ? `/espace-client/dossiers/${dossier.id}` : undefined,
        audience: {
          client: {
            customer_id: client?.id ?? doc.customer_id,
            email: client?.email,
            notify: true,
          },
          // Le client seul : ni avocat ni admins pour une décision du cabinet.
          lawyer_id: null,
          admin_ids_override: [],
        },
        entity: { type: 'document', id: doc.id },
      });
    } catch (err) {
      this.logger.error(
        `onDocumentReviewed(${payload?.documentId}) ignoré : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private isClientPortalDocument(doc: DocumentCustomer): boolean {
    return doc.metadata?.source === 'client_portal';
  }

  private clientLabel(client: any): string {
    return (
      client?.company_name?.trim() ||
      `${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() ||
      'un client'
    );
  }

  /**
   * Émet l'événement source du case-workflow. Appelé AVANT `this.notify(...)`
   * dans `onAfterCreate` : une exception ici ne doit jamais empêcher la
   * notification « document uploadé » de partir.
   */
  private emitWorkflowSourceEvent(document: DocumentCustomer): void {
    try {
      const dossierId = Number(document.dossier_id ?? document.dossier?.id);
      const tenantId = Number(document.tenant_id);
      if (!dossierId || !tenantId) return;
      this.eventEmitter.emit('case-workflow.source.document-changed', {
        tenantId,
        dossierId,
        documentId: document.id,
      });
    } catch (err) {
      this.logger.error(
        `emitWorkflowSourceEvent(document-changed) a échoué pour le document ${document.id} : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private load(
    id: number,
    event?: InsertEvent<DocumentCustomer> | UpdateEvent<DocumentCustomer>,
  ): Promise<DocumentCustomer | null> {
    return this.loadEntity<DocumentCustomer>(
      id,
      {
        relations: ['dossier', 'dossier.client', 'customer'],
      },
      event,
    );
  }
}
