import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DocumentCustomer } from '../entities/document-customer.entity';

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
    @InjectRepository(DocumentCustomer)
    private readonly docRepo: Repository<DocumentCustomer>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return DocumentCustomer;
  }

  protected async onAfterCreate(
    entity: DocumentCustomer,
    _event: InsertEvent<DocumentCustomer>,
  ): Promise<void> {
    // Recharger pour récupérer dossier + client + lawyer
    const doc = await this.load(entity.id);
    if (!doc) return;

    const dossier: any = doc.dossier;
    const client: any = dossier?.client ?? doc.customer;

    this.logger.log(
      `📢 Document uploadé | id=${doc.id} | name="${doc.name}" | dossier=${dossier?.dossier_number ?? '?'} | notify_client=${!!entity.notify_client}`,
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
          notify: !!entity.notify_client,
        },
        lawyer_id: dossier?.lawyer_id ?? null,
      },
      entity: { type: 'document', id: doc.id },
    });
  }

  private load(id: number): Promise<DocumentCustomer | null> {
    return this.docRepo.findOne({
      where: { id },
      relations: ['dossier', 'dossier.client', 'customer'],
    });
  }
}