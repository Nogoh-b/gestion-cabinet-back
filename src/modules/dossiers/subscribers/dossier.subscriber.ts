import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Conversation } from 'src/modules/chat/entities/conversation.entity';
import { ProcedureTemplate } from 'src/modules/procedure/entities/procedure-template.entity';
import { DEFAULT_PROCEDURE_TEMPLATE_NAME } from 'src/modules/procedure/seeder/default-procedure-template.seeder';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Dossier } from '../entities/dossier.entity';

/**
 * Subscriber métier pour l'entité Dossier.
 *
 * Effets gérés automatiquement :
 *  1. Création d'un dossier → crée la conversation de suivi de groupe
 *     et l'associe via dossier.conversation_id.
 *     L'avocat référent est ajouté comme participant initial.
 *
 *  2. Mise à jour des collaborateurs → synchronise la conversation.
 *     Tout collaborateur ajouté au dossier est automatiquement
 *     intégré comme participant de la conversation.
 *
 * Pour ajouter un nouvel effet de bord :
 *   - Surcharge onAfterCreate ou onAfterUpdate
 *   - Utilise hasColumnChanged / hasRelationChanged / getFieldChanges
 */
@Injectable()
export class DossierSubscriber extends NotifiableSubscriber<Dossier> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepo: Repository<ProcedureType>,
    @InjectRepository(ProcedureTemplate)
    private readonly procedureTemplateRepo: Repository<ProcedureTemplate>,
    private readonly procedureInstanceService: ProcedureInstanceService,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Dossier;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRÉATION
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Après la création d'un dossier :
   *  - Crée une conversation de groupe nommée d'après le numéro de dossier
   *  - Ajoute l'avocat référent comme participant initial
   *  - Lie la conversation au dossier via conversation_id (QueryBuilder pour
   *    éviter de re-déclencher le subscriber)
   */
  protected async onAfterCreate(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    await this.createConversation(entity, event);
    await this.createProcedureInstance(entity, event);
    await this.notifyDossierCreated(entity);
  }

  /**
   * Déclenche les notifications de création de dossier via le dispatcher central.
   *  - Client       → e-mail si entity.notify_client === true (case cochée dans le modal)
   *  - Avocat       → in-app + e-mail selon ses préférences
   *  - Collabs      → in-app + e-mail selon leurs préférences
   *  - Admins       → toujours (résolus par le dispatcher via role.code = 'admin')
   */
  private async notifyDossierCreated(entity: Dossier): Promise<void> {
    // Recharger les relations utiles si pas encore en mémoire
    const loaded = await this.load(entity.id).catch(() => null);
    const dossier = loaded ?? entity;
    if (!dossier) return;

    const clientUserId =
      (dossier.client as any)?.user_id ?? (dossier.client as any)?.user?.id;
    const clientEmail = (dossier.client as any)?.email;

    this.logger.log(
      `📢 Dossier créé | id=${dossier.id} | number="${dossier.dossier_number}" | lawyer=${dossier.lawyer_id ?? '?'} | client.user_id=${clientUserId ?? '?'} | notify_client=${!!entity.notify_client}`,
    );

    await this.notify({
      event: NotifiableEvent.DOSSIER_CREATED,
      title: `Nouveau dossier ${dossier.dossier_number}`,
      content: dossier.object?.trim() || `Dossier ${dossier.dossier_number} créé`,
      link: `/dossiers/${dossier.id}`,
      audience: {
        client: {
          user_id: clientUserId,
          email: clientEmail,
          notify: !!entity.notify_client,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((c) => (c as any).user_id ?? (c as any).user?.id)
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
    });
  }

  private async createConversation(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    const participants: Employee[] = [];

    if (entity.lawyer_id) {
      const lawyer = await this.employeeRepo.findOne({
        where: { id: entity.lawyer_id as any },
      });
      if (lawyer) participants.push(lawyer);
    }

    const conversation = this.conversationRepo.create({
      name: `Dossier ${entity.dossier_number}`,
      isGroup: true,
      participants,
      tenant_id: entity.tenant_id,
    });
    const saved = await this.conversationRepo.save(conversation);

    await event.manager
      .createQueryBuilder()
      .update(Dossier)
      .set({ conversation_id: saved.id })
      .where('id = :id', { id: entity.id })
      .execute();

    entity.conversation_id = saved.id;

    this.logger.log(
      `Conversation #${saved.id} créée et liée au dossier ${entity.dossier_number}`,
    );
  }

  private async createProcedureInstance(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    if (!entity.procedure_subtype_id) return;

    const subtype = await this.procedureTypeRepo.findOne({
      where: { id: entity.procedure_subtype_id },
      relations: ['procedure_template'],
    });

    // Résolution du templateId : propre au sous-type, ou template générique par défaut
    let templateId: string | undefined = subtype?.procedure_template_id ?? undefined;

    if (!templateId) {
      this.logger.warn(
        `Dossier ${entity.dossier_number} : le sous-type #${entity.procedure_subtype_id} ` +
        `n'a pas de template — utilisation du template générique par défaut`,
      );

      const defaultTemplate = await this.procedureTemplateRepo.findOne({
        where: { name: DEFAULT_PROCEDURE_TEMPLATE_NAME },
      });

      if (!defaultTemplate) {
        this.logger.error(
          `Template par défaut "${DEFAULT_PROCEDURE_TEMPLATE_NAME}" introuvable en base — ` +
          `aucune ProcedureInstance créée pour le dossier ${entity.dossier_number}. ` +
          `Exécutez le seeder DefaultProcedureTemplateSeeder.`,
        );
        return;
      }

      templateId = defaultTemplate.id;
    }

    const instance = await this.procedureInstanceService.create(
      {
        templateId,
        title: `Procédure - ${entity.dossier_number}`,
      },
      'system',
    );

    await event.manager
      .createQueryBuilder()
      .update(Dossier)
      .set({ procedureInstanceId: instance.id })
      .where('id = :id', { id: entity.id })
      .execute();

    entity.procedureInstanceId = instance.id;

    this.logger.log(
      `ProcedureInstance #${instance.id} créée et liée au dossier ${entity.dossier_number}`,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MISE À JOUR
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Après une mise à jour du dossier :
   *  - Si la relation `collaborators` a changé → synchronise les participants
   *    de la conversation (ajout uniquement, pas de suppression automatique)
   *  - Extensible : ajoute d'autres blocs conditionnels pour d'autres champs
   */
  protected async onAfterUpdate(
    entity: Partial<Dossier>,
    event: UpdateEvent<Dossier>,
  ): Promise<void> {
    if (this.hasRelationChanged(event, 'collaborators')) {
      await this.syncCollaboratorsToConversation(entity, event);
    }

    if (this.hasColumnChanged(event, 'status')) {
      await this.notifyStatusChanged(entity, event);
    }
  }

  /**
   * Notifie le changement de statut. Le client est informé seulement si le
   * dossier porte `notify_client=true` (transient — pour les UPDATEs venant
   * d'un modal qui propose la case). L'avocat et les collaborateurs sont
   * notifiés selon leurs préférences.
   */
  private async notifyStatusChanged(
    entity: Partial<Dossier>,
    event: UpdateEvent<Dossier>,
  ): Promise<void> {
    const change = this.getFieldChanges(event, ['status']).find(
      (c) => c.field === 'status',
    );
    if (!change) return;

    const id = entity.id ?? (event.databaseEntity as Dossier)?.id;
    if (!id) return;

    const loaded = await this.load(id).catch(() => null);
    const dossier = loaded ?? (event.databaseEntity as Dossier);
    if (!dossier) return;

    const oldLabel = labelStatus(change.oldValue);
    const newLabel = labelStatus(change.newValue);

    this.logger.log(
      `📢 Statut dossier changé | id=${dossier.id} | number="${dossier.dossier_number}" | "${oldLabel}" → "${newLabel}" | notify_client=${!!(entity as Dossier).notify_client}`,
    );

    await this.notify({
      event: NotifiableEvent.DOSSIER_STATUS_CHANGED,
      title: `Statut du dossier ${dossier.dossier_number} mis à jour`,
      content: `Passage de "${oldLabel}" à "${newLabel}"`,
      link: `/dossiers/${dossier.id}`,
      audience: {
        client: {
          user_id: (dossier.client as any)?.user_id,
          email: (dossier.client as any)?.email,
          notify: !!(entity as Dossier).notify_client,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((c) => (c as any).user_id ?? (c as any).user?.id)
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
      changes: { status: { from: change.oldValue, to: change.newValue } },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LOGIQUE PRIVÉE
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Ajoute à la conversation les collaborateurs qui ne sont pas encore participants.
   * N'enlève pas les participants existants (retrait = action délibérée).
   */
  private async syncCollaboratorsToConversation(
    entity: Partial<Dossier>,
    event: UpdateEvent<Dossier>,
  ): Promise<void> {
    const dossierId = entity.id ?? (event.databaseEntity as Dossier)?.id;
    if (!dossierId) return;

    const dossier = await this.loadWithConversation(dossierId);

    if (!dossier?.conversation) {
      this.logger.warn(
        `Dossier #${dossierId} sans conversation — synchronisation ignorée`,
      );
      return;
    }

    const conversation = dossier.conversation;
    const existingIds = new Set(conversation.participants.map(p => p.id));

    const toAdd = (dossier.collaborators ?? []).filter(
      c => !existingIds.has(c.id),
    );

    if (toAdd.length === 0) return;

    conversation.participants = [...conversation.participants, ...toAdd];
    await this.conversationRepo.save(conversation);

    this.logger.log(
      `${toAdd.length} collaborateur(s) ajouté(s) à la conversation #${conversation.id}` +
        ` du dossier ${dossier.dossier_number}` +
        ` [${toAdd.map(e => e.id).join(', ')}]`,
    );

    // Notifier chaque nouveau collaborateur en in-app + e-mail
    const newCollabUserIds = toAdd
      .map((emp) => (emp as any).user_id ?? (emp as any).user?.id)
      .filter(Boolean);
    if (newCollabUserIds.length > 0) {
      this.logger.log(
        `📢 Collaborateurs ajoutés au dossier | id=${dossier.id} | number="${dossier.dossier_number}" | new_users=[${newCollabUserIds.join(', ')}]`,
      );
      await this.notify({
        event: NotifiableEvent.COLLABORATOR_ADDED,
        title: `Vous avez été ajouté au dossier ${dossier.dossier_number}`,
        content: dossier.object?.trim() || '',
        link: `/dossiers/${dossier.id}`,
        audience: {
          lawyer_id: null,
          collaborator_ids: newCollabUserIds,
        },
        entity: { type: 'dossier', id: dossier.id },
      });
    }
  }

  // ── Helpers de rechargement (pattern uniformisé avec DiligenceSubscriber) ──

  private load(id: number): Promise<Dossier | null> {
    return this.dossierRepo.findOne({
      where: { id },
      relations: ['client', 'lawyer', 'collaborators'],
    });
  }

  private loadWithConversation(id: number): Promise<Dossier | null> {
    return this.dossierRepo.findOne({
      where: { id },
      relations: ['collaborators', 'conversation', 'conversation.participants'],
    });
  }
}

/** Étiquette lisible pour un DossierStatus numérique. */
function labelStatus(v: any): string {
  const n = Number(v);
  switch (n) {
    case DossierStatus.OPEN: return 'Ouvert';
    case DossierStatus.PRELIMINARY_ANALYSIS: return 'Analyse';
    case DossierStatus.AMICABLE: return 'Amiable';
    case DossierStatus.LITIGATION: return 'Contentieux';
    default: return String(v ?? '');
  }
}