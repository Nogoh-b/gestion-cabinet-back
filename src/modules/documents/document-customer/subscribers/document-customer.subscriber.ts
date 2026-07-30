import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, InsertEvent } from 'typeorm';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { DocumentCustomer } from '../entities/document-customer.entity';

/**
 * Les notifications documentaires sont consommées après commit depuis
 * l'outbox. Le hook TypeORM reste volontairement sans effet afin qu'aucun
 * envoi réseau ne dépende de la transaction métier.
 */
@Injectable()
export class DocumentCustomerSubscriber extends NotifiableSubscriber<DocumentCustomer> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return DocumentCustomer;
  }

  protected async onAfterCreate(
    _entity: DocumentCustomer,
    _event: InsertEvent<DocumentCustomer>,
  ): Promise<void> {
    // Effet différé : outbox.document.version.created.
  }

  @OnEvent('outbox.document.version.created')
  async handleDocumentCreatedOutbox(payload: {
    documentId: number;
    initialVersion?: boolean;
    notifyClient?: boolean;
  }): Promise<void> {
    if (payload.initialVersion !== true) return;
    const doc = await this.load(Number(payload.documentId)).catch(() => null);
    if (!doc) return;

    const dossier: any = doc.dossier;
    const client: any = dossier?.client ?? doc.customer;
    const notifyClient = payload.notifyClient === true;

    await this.notificationDispatcher.dispatchStrict({
      event: NotifiableEvent.DOCUMENT_UPLOADED,
      title: `Nouveau document — ${doc.name}`,
      content: dossier
        ? `Document ajouté au dossier ${dossier.dossier_number}`
        : 'Nouveau document partagé',
      link: dossier ? `/dossiers/${dossier.id}/documents` : '/documents',
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

  private load(
    id: number,
    event?: InsertEvent<DocumentCustomer>,
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
