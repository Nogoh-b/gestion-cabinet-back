import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { DocumentCustomer } from '../entities/document-customer.entity';
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
    const id = entity.id ?? (event.databaseEntity as DocumentCustomer)?.id;
    if (!id) return;
    const doc = await this.load(id, event).catch(() => null);
    if (doc) this.emitWorkflowSourceEvent(doc);
  }

  private emitWorkflowSourceEvent(document: DocumentCustomer): void {
    const dossierId = Number(document.dossier_id ?? document.dossier?.id);
    const tenantId = Number(document.tenant_id);
    if (!dossierId || !tenantId) return;
    this.eventEmitter.emit('case-workflow.source.document-changed', {
      tenantId,
      dossierId,
      documentId: document.id,
    });
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
