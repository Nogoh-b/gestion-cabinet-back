import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubscriptionEvent,
  SubscriptionEventType,
} from './entities/subscription-event.entity';
import type { SubscriptionActorType } from './entities/subscription.entity';

/** Auteur d'une transition d'abonnement. */
export interface SubscriptionActor {
  type: SubscriptionActorType;
  id?: number | null;
  label?: string | null;
}

export const SYSTEM_ACTOR: SubscriptionActor = { type: 'system' };

/** Construit l'acteur « utilisateur de cabinet » depuis req.user. */
export function cabinetUserActor(user: any): SubscriptionActor {
  return {
    type: 'cabinet_user',
    id: Number(user?.userId ?? user?.id) || null,
    label: user?.email ?? user?.username ?? null,
  };
}

@Injectable()
export class SubscriptionEventsService {
  private readonly logger = new Logger(SubscriptionEventsService.name);

  constructor(
    @InjectRepository(SubscriptionEvent)
    private readonly repo: Repository<SubscriptionEvent>,
  ) {}

  /** Enregistre un événement. Ne lève jamais (n'interrompt pas la transition). */
  async record(input: {
    cabinetId: number;
    subscriptionId?: number | null;
    type: SubscriptionEventType;
    actor?: SubscriptionActor;
    payload?: Record<string, any> | null;
  }): Promise<void> {
    const actor = input.actor ?? SYSTEM_ACTOR;
    try {
      await this.repo.insert({
        cabinet_id: input.cabinetId,
        subscription_id: input.subscriptionId ?? null,
        type: input.type,
        actor_type: actor.type,
        actor_id: actor.id ?? null,
        actor_label: actor.label?.slice(0, 150) ?? null,
        payload: input.payload ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Événement d'abonnement non enregistré (${input.type}, cabinet ${input.cabinetId}) : ${(error as Error).message}`,
      );
    }
  }

  listForCabinet(cabinetId: number, limit = 200) {
    return this.repo.find({
      where: { cabinet_id: cabinetId },
      order: { created_at: 'DESC', id: 'DESC' },
      take: Math.min(500, Math.max(1, limit)),
    });
  }

  /** Vrai si un événement de ce type avec cette clé existe déjà (dédoublonnage). */
  async exists(cabinetId: number, type: SubscriptionEventType, key: string) {
    const count = await this.repo
      .createQueryBuilder('e')
      .where('e.cabinet_id = :cabinetId', { cabinetId })
      .andWhere('e.type = :type', { type })
      .andWhere("JSON_UNQUOTE(JSON_EXTRACT(e.payload, '$.key')) = :key", { key })
      .getCount();
    return count > 0;
  }
}
