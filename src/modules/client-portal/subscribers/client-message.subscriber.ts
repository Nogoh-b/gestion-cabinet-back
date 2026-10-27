import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DataSource, EntityManager, InsertEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';

import { ClientMessage } from '../entities/client-message.entity';

/**
 * Notifie l'autre partie à chaque message du portail :
 *  - client → cabinet : avocat du dossier (ou avocats des dossiers du client)
 *    et admins ;
 *  - cabinet → client : le client seul (application + e-mail selon ses
 *    préférences).
 */
@Injectable()
export class ClientMessageSubscriber extends NotifiableSubscriber<ClientMessage> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return ClientMessage;
  }

  protected async onAfterCreate(
    message: ClientMessage,
    event: InsertEvent<ClientMessage>,
  ): Promise<void> {
    const manager = event.manager ?? this.dataSource.manager;
    const customer = await manager.findOne(Customer, {
      where: { id: message.customer_id },
    });
    if (!customer) return;

    const preview =
      message.content.length > 140
        ? `${message.content.slice(0, 137)}…`
        : message.content;

    if (message.sender_type === 'cabinet') {
      await this.notify({
        event: NotifiableEvent.CABINET_MESSAGE_RECEIVED,
        title: 'Nouveau message de votre cabinet',
        content: preview,
        link: '/espace-client/messages',
        audience: {
          client: {
            customer_id: customer.id,
            email: customer.email,
            notify: true,
          },
          lawyer_id: null,
          admin_ids_override: [],
        },
        entity: { type: 'client_message', id: message.id },
      });
      return;
    }

    const lawyerIds = await this.lawyersOf(manager, message);
    const who =
      customer.company_name?.trim() ||
      `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
      'Un client';

    await this.notify({
      event: NotifiableEvent.CLIENT_MESSAGE_RECEIVED,
      title: `Message de ${who}`,
      content: preview,
      link: `/clients/${customer.id}/fiche#messages`,
      audience: {
        lawyer_id: lawyerIds[0] ?? null,
        collaborator_ids: lawyerIds.slice(1),
      },
      entity: { type: 'client_message', id: message.id },
    });
  }

  /** Avocat du dossier visé, sinon avocats de tous les dossiers du client. */
  private async lawyersOf(
    manager: EntityManager,
    message: ClientMessage,
  ): Promise<number[]> {
    const dossiers = await manager.find(Dossier, {
      where: message.dossier_id
        ? { id: message.dossier_id }
        : { client_id: message.customer_id },
      select: ['id', 'lawyer_id'],
      take: 50,
    });
    return [
      ...new Set(
        dossiers.map((d) => Number(d.lawyer_id)).filter((id) => id > 0),
      ),
    ];
  }
}
