import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository } from 'typeorm';

import { Paiement } from '../entities/paiement.entity';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';

/**
 * Subscriber métier pour les paiements.
 *
 * Événements émis :
 *  - PAIEMENT_RECEIVED → quand un paiement est enregistré
 *    Le client reçoit un reçu si `notify_client=true` ; l'avocat du dossier
 *    et les admins sont notifiés selon leurs préférences.
 */
@Injectable()
export class PaiementSubscriber extends NotifiableSubscriber<Paiement> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Paiement;
  }

  protected async onAfterCreate(
    entity: Paiement,
    _event: InsertEvent<Paiement>,
  ): Promise<void> {
    // Recharger avec la facture + dossier + client pour résoudre l'audience
    const paiement = await this.paiementRepo.findOne({
      where: { id: entity.id as any },
      relations: ['facture', 'facture.client', 'facture.dossier'],
    });
    if (!paiement?.facture) return;
    const facture: any = paiement.facture;

    await this.notify({
      event: NotifiableEvent.PAIEMENT_RECEIVED,
      title: `Paiement reçu pour la facture ${facture.numero}`,
      content:
        `Montant reçu : ${formatMoney(paiement.montant)} ` +
        `(${formatDate(paiement.datePaiement)})`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: facture.client?.user_id,
          email: facture.client?.email,
          notify: !!entity.notify_client,
        },
        lawyer_id: facture.dossier?.lawyer_id ?? null,
      },
      entity: { type: 'paiement', id: paiement.id as any },
    });
  }
}

function formatMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('fr-FR');
}
