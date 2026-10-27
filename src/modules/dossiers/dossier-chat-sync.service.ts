import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  In,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import {
  getCurrentRequestUser,
  runWithoutRequestUser,
} from 'src/core/security/request-user.context';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { MainGateway } from 'src/core/shared/services/socket/main.gateway';
import {
  Employee,
  EmployeeStatus,
} from 'src/modules/agencies/employee/entities/employee.entity';
import {
  Conversation,
  ConversationType,
} from 'src/modules/chat/entities/conversation.entity';
import { ChatService } from 'src/modules/chat/services/chat/chat.service';
import { Dossier } from './entities/dossier.entity';

export interface DossierChatSyncResult {
  conversationId: number;
  added: number[];
  removed: number[];
  created: boolean;
}

export interface DossierChatSyncOptions {
  /** Notifier (in-app + e-mail) les membres ajoutés. Défaut : true. */
  notifyAdded?: boolean;
}

/**
 * Chat d'un dossier = ses membres, et eux seuls : l'avocat référent, les
 * collaborateurs et l'auteur du dossier (employés actifs).
 *
 * `sync()` aligne exactement les participants de la conversation sur cette
 * liste (ajouts ET retraits) et la crée si elle manque. Elle est appelée
 * explicitement à chaque changement de membres : TypeORM ne déclenche pas
 * `afterUpdate` quand seule une relation ManyToMany change, un subscriber
 * ne suffit donc pas.
 *
 * Les événements temps réel et les notifications partent après la validation
 * de la transaction (sinon les membres pourraient recharger une conversation
 * pas encore visible, ou voir une conversation annulée).
 */
@Injectable()
export class DossierChatSyncService
  implements EntitySubscriberInterface<unknown>
{
  private readonly logger = new Logger(DossierChatSyncService.name);
  private readonly pending = new WeakMap<
    QueryRunner,
    Array<() => Promise<void>>
  >();

  constructor(
    private readonly dataSource: DataSource,
    private readonly chatService: ChatService,
    private readonly notificationDispatcher: NotificationDispatcher,
    private readonly moduleRef: ModuleRef,
  ) {
    // Écoute les fins de transaction (aucune entité ciblée).
    dataSource.subscribers.push(this);
  }

  private get gateway(): MainGateway | null {
    try {
      return this.moduleRef.get(MainGateway, { strict: false });
    } catch {
      return null;
    }
  }

  /** Membres attendus du chat d'un dossier. */
  static expectedMemberIds(
    dossier: Pick<Dossier, 'lawyer_id' | 'created_by_id' | 'collaborators'>,
  ): number[] {
    return [
      dossier.lawyer_id,
      dossier.created_by_id,
      ...(dossier.collaborators ?? []).map((c) => c?.id),
    ]
      .map(Number)
      .filter((id, index, all) => !!id && all.indexOf(id) === index);
  }

  async sync(
    dossierId: number,
    manager: EntityManager = this.dataSource.manager,
    options: DossierChatSyncOptions = {},
  ): Promise<DossierChatSyncResult | null> {
    // Les membres ne dépendent pas de ce que voit l'appelant (dossiers
    // confidentiels) : relecture sans filtre de visibilité.
    const dossier = await runWithoutRequestUser(() =>
      manager.findOne(Dossier, {
        where: { id: dossierId },
        relations: ['collaborators'],
      }),
    );
    if (!dossier) return null;

    const expectedIds = DossierChatSyncService.expectedMemberIds(dossier);
    const members = expectedIds.length
      ? (
          await manager.find(Employee, { where: { id: In(expectedIds) } })
        ).filter(
          (e) =>
            e.status !== EmployeeStatus.INACTIVE &&
            e.status !== EmployeeStatus.SUSPENDED,
        )
      : [];
    const memberIds = members.map((m) => m.id);

    const conversationRepo = manager.getRepository(Conversation);
    let conversation = dossier.conversation_id
      ? await conversationRepo.findOne({
          where: { id: dossier.conversation_id },
        })
      : null;

    let result: DossierChatSyncResult;
    if (!conversation) {
      conversation = await conversationRepo.save(
        conversationRepo.create({
          name: `Dossier ${dossier.dossier_number}`,
          isGroup: true,
          type: ConversationType.DOSSIER,
          participants: members,
          tenant_id: dossier.tenant_id,
        }),
      );
      // QueryBuilder : ne re-déclenche pas les subscribers du dossier.
      await manager
        .createQueryBuilder()
        .update(Dossier)
        .set({ conversation_id: conversation.id })
        .where('id = :id', { id: dossier.id })
        .execute();
      result = {
        conversationId: conversation.id,
        added: memberIds,
        removed: [],
        created: true,
      };
    } else {
      const relation = manager
        .createQueryBuilder()
        .relation(Conversation, 'participants')
        .of(conversation.id);
      const currentIds = (await relation.loadMany<Employee>()).map(
        (p) => p.id,
      );
      const added = memberIds.filter((id) => !currentIds.includes(id));
      const removed = currentIds.filter((id) => !memberIds.includes(id));
      if (added.length || removed.length) {
        await relation.addAndRemove(added, removed);
      }
      if (conversation.type !== ConversationType.DOSSIER) {
        await conversationRepo.update(conversation.id, {
          type: ConversationType.DOSSIER,
        });
      }
      result = {
        conversationId: conversation.id,
        added,
        removed,
        created: false,
      };
    }

    if (result.added.length || result.removed.length) {
      this.logger.log(
        `Chat du dossier ${dossier.dossier_number} (#${result.conversationId}) : +[${result.added.join(', ')}] -[${result.removed.join(', ')}]`,
      );
      this.afterCommit(manager, () =>
        this.announce(dossier, result, memberIds, options),
      );
    }
    return result;
  }

  /**
   * Rattrapage : aligne le chat de tous les dossiers du cabinet courant
   * (conversations manquantes ou membres désynchronisés).
   */
  async syncAll(): Promise<{ dossiers: number; changed: number }> {
    await this.chatService.normalizeConversationTypes();
    // Sans filtre de visibilité : les dossiers confidentiels sont inclus.
    return runWithoutRequestUser(async () => {
      const dossiers = await this.dataSource.manager.find(Dossier, {
        select: ['id'],
      });
      let changed = 0;
      for (const { id } of dossiers) {
        const result = await this.sync(id, this.dataSource.manager, {
          notifyAdded: false,
        });
        if (result && (result.added.length || result.removed.length)) {
          changed++;
        }
      }
      return { dossiers: dossiers.length, changed };
    });
  }

  // ── Diffusion ──────────────────────────────────────────────────────────────

  private async announce(
    dossier: Dossier,
    result: DossierChatSyncResult,
    memberIds: number[],
    options: DossierChatSyncOptions,
  ): Promise<void> {
    const gateway = this.gateway;
    if (gateway) {
      for (const id of result.added) {
        const summary = await this.chatService.getConversationSummaryFor(
          id,
          result.conversationId,
        );
        if (summary) gateway.emitConversationAdded(id, summary);
      }
      for (const id of result.removed) {
        gateway.emitConversationRemoved(
          id,
          result.conversationId,
          `Vous ne faites plus partie du dossier ${dossier.dossier_number}.`,
        );
      }
      const staying = memberIds.filter((id) => !result.added.includes(id));
      if (staying.length && !result.created) {
        const summary = await this.chatService.getConversationSummaryFor(
          staying[0],
          result.conversationId,
        );
        if (summary) {
          gateway.emitConversationUpdated(staying, result.conversationId, {
            participants: summary.participants,
          });
        }
      }
    }

    // La création est déjà notifiée (« dossier créé ») et le rattrapage ne
    // notifie personne. L'auteur de l'action n'est pas prévenu de son propre
    // ajout ou retrait.
    if (options.notifyAdded === false || result.created) return;
    const actorId = getCurrentRequestUser()?.userId;
    const added = result.added.filter((id) => id !== actorId);
    const removed = result.removed.filter((id) => id !== actorId);
    if (!added.length && !removed.length) return;

    const mailDossier =
      (await this.dataSource.manager
        .findOne(Dossier, {
          where: { id: dossier.id },
          relations: ['client', 'lawyer', 'collaborators'],
        })
        .catch(() => null)) ?? dossier;
    const emailContext = buildEntityMailContext({
      dossier: mailDossier,
      resourceType: 'dossier',
      resource: mailDossier as any,
    });
    const content = dossier.object?.trim() || '';

    if (added.length) {
      await this.notificationDispatcher
        .dispatch({
          event: NotifiableEvent.COLLABORATOR_ADDED,
          title: `Vous avez été ajouté au dossier ${dossier.dossier_number}`,
          content,
          link: `/dossiers/${dossier.id}`,
          audience: { lawyer_id: null, collaborator_ids: added },
          entity: { type: 'dossier', id: dossier.id },
          emailContext,
        })
        .catch((err) =>
          this.logger.warn(
            `Notification d'ajout au dossier ignorée : ${err?.message}`,
          ),
        );
    }
    if (removed.length) {
      // Seul le membre retiré est prévenu ; un dossier confidentiel ne lui
      // est plus accessible, le lien mène alors à la liste.
      await this.notificationDispatcher
        .dispatch({
          event: NotifiableEvent.COLLABORATOR_REMOVED,
          title: `Vous avez été retiré du dossier ${dossier.dossier_number}`,
          content,
          link: dossier.confidentiality_level
            ? '/dossiers'
            : `/dossiers/${dossier.id}`,
          audience: {
            lawyer_id: null,
            collaborator_ids: removed,
            admin_ids_override: [],
          },
          entity: { type: 'dossier', id: dossier.id },
          emailContext,
        })
        .catch((err) =>
          this.logger.warn(
            `Notification de retrait du dossier ignorée : ${err?.message}`,
          ),
        );
    }
  }

  // ── Après validation de la transaction ─────────────────────────────────────

  private afterCommit(manager: EntityManager, task: () => Promise<void>) {
    const runner = manager.queryRunner;
    const run = () =>
      void task().catch((err) =>
        this.logger.warn(`Diffusion du chat de dossier : ${err?.message}`),
      );
    if (!runner?.isTransactionActive) {
      run();
      return;
    }
    const tasks = this.pending.get(runner) ?? [];
    tasks.push(async () => run());
    this.pending.set(runner, tasks);
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    const tasks = this.pending.get(event.queryRunner);
    if (!tasks) return;
    this.pending.delete(event.queryRunner);
    for (const task of tasks) void task();
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    this.pending.delete(event.queryRunner);
  }
}
