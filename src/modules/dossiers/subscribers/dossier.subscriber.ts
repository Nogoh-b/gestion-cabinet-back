import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Conversation } from 'src/modules/chat/entities/conversation.entity';
import { StatutFacture, TypeFacture } from 'src/modules/facture/dto/create-facture.dto';
import { FactureService } from 'src/modules/facture/facture.service';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { ProcedureTemplate } from 'src/modules/procedure/entities/procedure-template.entity';
import { DEFAULT_PROCEDURE_TEMPLATE_NAME } from 'src/modules/procedure/seeder/default-procedure-template.seeder';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Dossier } from '../entities/dossier.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';

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
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepo: Repository<ProcedureType>,
    @InjectRepository(ProcedureTemplate)
    private readonly procedureTemplateRepo: Repository<ProcedureTemplate>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    @InjectRepository(StageVisit)
    private readonly stageVisitRepo: Repository<StageVisit>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @Inject(forwardRef(() => FactureService))
    private readonly factureService: FactureService,
    private readonly procedureInstanceService: ProcedureInstanceService,
  ) {
    super(dataSource, notificationDispatcher);
    console.log(forwardRef);
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
    await this.createOpeningFeeInvoice(entity, event);
    await this.notifyDossierCreated(entity, event);
  }

  private async createOpeningFeeInvoice(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    this.logger.log(`[createOpeningFeeInvoice] Démarrage pour dossier ${entity.dossier_number} (id: ${entity.id})`);
    
    try {
      // Étape 1 : Récupération du cabinet
      this.logger.debug(`[createOpeningFeeInvoice] Récupération du cabinet pour tenant: ${getCurrentTenantId()}`);
      const cabinet = await this.cabinetRepo.findOne({
        where: { id: getCurrentTenantId() },
      });

      if (!cabinet) {
        this.logger.warn(`[createOpeningFeeInvoice] Cabinet introuvable pour tenant ${getCurrentTenantId()}`);
        return;
      }

      this.logger.debug(`[createOpeningFeeInvoice] Cabinet trouvé: dossier_opening_fee_enabled=${cabinet.dossier_opening_fee_enabled}, dossier_opening_fee=${cabinet.dossier_opening_fee}`);

      // Étape 2 : Vérification des conditions d'activation
      if (!cabinet.dossier_opening_fee_enabled) {
        this.logger.log(`[createOpeningFeeInvoice] Frais d'ouverture désactivés pour le cabinet, abandon`);
        return;
      }

      if (Number(cabinet.dossier_opening_fee) <= 0) {
        this.logger.log(`[createOpeningFeeInvoice] Frais d'ouverture <= 0 (${cabinet.dossier_opening_fee}), abandon`);
        return;
      }

      // Étape 3 : Chargement du dossier complet
      this.logger.debug(`[createOpeningFeeInvoice] Chargement du dossier complet pour id: ${entity.id}`);
      const dossier = await this.load(entity.id, event).catch((err) => {
        this.logger.warn(`[createOpeningFeeInvoice] Erreur lors du chargement du dossier: ${err?.message || err}`);
        return null;
      });

      if (!dossier) {
        this.logger.warn(`[createOpeningFeeInvoice] Impossible de charger le dossier ${entity.id}`);
      }

      // Étape 4 : Récupération du client
      const clientId = (dossier?.client as any)?.id ?? entity.client_id;
      this.logger.debug(`[createOpeningFeeInvoice] Client ID trouvé: ${clientId} (dossier?.client?.id=${dossier?.client?.id}, entity.client_id=${entity.client_id})`);

      if (!clientId) {
        this.logger.warn(
          `[createOpeningFeeInvoice] Facture ouverture ignorée pour dossier ${entity.dossier_number} : client introuvable`,
        );
        return;
      }

      // Étape 5 : Calcul des montants
      const montantHT = Number(cabinet.dossier_opening_fee);
      const tauxTVA = Number(cabinet.dossier_opening_fee_tva ?? 0);
      const montantTVA = Math.round(montantHT * tauxTVA) / 100;
      const montantTTC = montantHT + montantTVA;
      const label = cabinet.dossier_opening_fee_label?.trim() || "Frais d'ouverture de dossier";
      
      this.logger.debug(`[createOpeningFeeInvoice] Calculs: montantHT=${montantHT}, tauxTVA=${tauxTVA}, montantTVA=${montantTVA}, montantTTC=${montantTTC}, label="${label}"`);

      // Étape 6 : Calcul de l'échéance
      const today = new Date();
      const echeance = new Date(today);
      echeance.setDate(echeance.getDate() + 30);
      this.logger.debug(`[createOpeningFeeInvoice] Date facture: ${today.toISOString()}, échéance: ${echeance.toISOString()}`);

      // Étape 7 : Création de la facture
      this.logger.log(`[createOpeningFeeInvoice] Tentative de création de facture pour dossier ${entity.dossier_number}, client ${clientId}`);
      
      // Récupérer l'ID de la StageVisit d'ouverture (créée par createProcedureInstance)
      const openingStageVisitId = (entity as any)._openingStageVisitId;
      
      if (!openingStageVisitId) {
        this.logger.warn(
          `[createOpeningFeeInvoice] ⚠️ openingStageVisitId introuvable pour dossier ${entity.dossier_number} — ` +
          `la facture ne sera pas liée à l'étape Ouverture`,
        );
      } else {
        this.logger.debug(
          `[createOpeningFeeInvoice] openingStageVisitId trouvé: ${openingStageVisitId}`,
        );
      }
      
      const factureData = {
        dossierId: entity.id,
        clientId,
        type: TypeFacture.FRAIS_PROCEDURE,
        statut: StatutFacture.ENVOYEE,
        montantHT,
        tauxTVA,
        montantTVA,
        montantTTC,
        dateFacture: today,
        dateEcheance: echeance,
        description: label,
        notify_client: false,
        stage_visit_id: openingStageVisitId,
      };
      
      this.logger.debug(`[createOpeningFeeInvoice] Données facture: ${JSON.stringify(factureData)}`);
      
      const createdFacture = await this.factureService.createFacture(factureData as any, {
        manager: event.manager,
        dossier: dossier ?? entity,
        client: dossier?.client,
      });

      // Vérifier que la facture a bien été liée à la StageVisit d'ouverture
      if (openingStageVisitId) {
        const updatedFacture = await event.manager
          .getRepository(Facture)
          .findOne({ where: { id: createdFacture.id } });
        
        if (updatedFacture?.stageVisit_id !== openingStageVisitId) {
          this.logger.warn(
            `[createOpeningFeeInvoice] ⚠️ stageVisit_id non renseigné pour la facture ${createdFacture.numero} — ` +
            `mise à jour manuelle`,
          );
          await event.manager.getRepository(Facture).update(createdFacture.id, {
            stageVisit_id: openingStageVisitId,
          });
        }
      }

      this.logger.log(
        `[createOpeningFeeInvoice] ✅ Facture d'ouverture créée avec succès pour le dossier ${entity.dossier_number} ` +
        `(facture: ${createdFacture?.numero ?? '?'}, stageVisit: ${openingStageVisitId})`,
      );
      
    } catch (err) {
      this.logger.error(
        `[createOpeningFeeInvoice] ❌ Erreur création facture ouverture dossier ${entity.dossier_number}: ${err?.message}`,
        err?.stack // Ajout du stack trace pour mieux déboguer
      );
    }
  }
  /**
   * Déclenche les notifications de création de dossier via le dispatcher central.
   *  - Client       → e-mail si entity.notify_client === true (case cochée dans le modal)
   *  - Avocat       → in-app + e-mail selon ses préférences
   *  - Collabs      → in-app + e-mail selon leurs préférences
   *  - Admins       → toujours (résolus par le dispatcher via role.code = 'admin')
   */
  private async notifyDossierCreated(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    // Recharger les relations utiles si pas encore en mémoire
    const loaded = await this.load(entity.id, event).catch(() => null);
    const dossier = loaded ?? entity;
    if (!dossier) return;

    const clientUserId =
      (dossier.client as any)?.user_id ?? (dossier.client as any)?.user?.id;
    const clientEmail = (dossier.client as any)?.email;
    const notifyClient = this.resolveTransientBoolean('notify_client', entity, dossier as any);

    this.logger.log(
      `📢 Dossier créé | id=${dossier.id} | number="${dossier.dossier_number}" | lawyer=${dossier.lawyer_id ?? '?'} | client.user_id=${clientUserId ?? '?'} | notify_client=${notifyClient}`,
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
          notify: notifyClient,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((c) => (c as any).user_id ?? (c as any).user?.id)
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'dossier',
        resource: dossier as any,
      }),
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

    // Stocker l'ID de la StageVisit d'ouverture pour la liaison de la facture
    (entity as any)._openingStageVisitId = (instance as any)?._openingStageVisitId;

    this.logger.log(
      `ProcedureInstance #${instance.id} créée et liée au dossier ${entity.dossier_number} ` +
      `(openingStageVisitId: ${(entity as any)._openingStageVisitId})`,
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
    // ⚠️ TypeORM ne renseigne pas de façon fiable `event.updatedRelations`
    // pour les ManyToMany (ex: ajout d'un collaborateur via
    // `dossier.collaborators.push(...)` + save). On ne peut donc pas se fier à
    // `hasRelationChanged('collaborators')`. La synchro est idempotente
    // (n'ajoute que les participants manquants et ne notifie que les nouveaux),
    // on l'exécute donc à chaque update du dossier.
    await this.syncCollaboratorsToConversation(entity, event);

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

    const loaded = await this.load(id, event).catch(() => null);
    const dossier = loaded ?? (event.databaseEntity as Dossier);
    if (!dossier) return;
    const notifyClient = this.resolveTransientBoolean(
      'notify_client',
      entity as any,
      event.databaseEntity as any,
      dossier as any,
    );

    const oldLabel = labelStatus(change.oldValue);
    const newLabel = labelStatus(change.newValue);

    this.logger.log(
      `📢 Statut dossier changé | id=${dossier.id} | number="${dossier.dossier_number}" | "${oldLabel}" → "${newLabel}" | notify_client=${notifyClient}`,
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
          notify: notifyClient,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((c) => (c as any).user_id ?? (c as any).user?.id)
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
      changes: { status: { from: change.oldValue, to: change.newValue } },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'dossier',
        resource: dossier as any,
      }),
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
    this.logger.log(
      `🔄 syncCollaboratorsToConversation START | dossierId=${dossierId} | entity.id=${entity.id} | dbEntity.id=${(event.databaseEntity as Dossier)?.id}`,
    );
    if (!dossierId) {
      this.logger.warn(`🔄 syncCollaborators SKIP — no dossierId`);
      return;
    }

    const dossier = await this.loadWithConversation(dossierId, event);

    this.logger.log(
      `🔄 syncCollaborators loaded dossier | found=${!!dossier} | conversation_id=${dossier?.conversation_id ?? dossier?.conversation?.id ?? 'NONE'} | collaborators=${dossier?.collaborators?.length ?? 0} | conversation.participants=${dossier?.conversation?.participants?.length ?? 0}`,
    );

    if (!dossier?.conversation) {
      this.logger.warn(
        `Dossier #${dossierId} sans conversation — synchronisation ignorée`,
      );
      return;
    }

    const conversation = dossier.conversation;
    const existingIds = new Set(conversation.participants.map(p => p.id));
    const collaboratorIds = (dossier.collaborators ?? []).map(c => c.id);

    this.logger.log(
      `🔄 syncCollaborators comparing | existing participants=[${[...existingIds].join(', ')}] | dossier collaborators=[${collaboratorIds.join(', ')}]`,
    );

    const toAdd = (dossier.collaborators ?? []).filter(
      c => !existingIds.has(c.id),
    );

    if (toAdd.length === 0) {
      this.logger.log(
        `🔄 syncCollaborators — aucun nouveau collaborateur à ajouter (tous déjà participants)`,
      );
      return;
    }

    conversation.participants = [...conversation.participants, ...toAdd];
    await this.conversationRepo.save(conversation);

    this.logger.log(
      `✅ ${toAdd.length} collaborateur(s) ajouté(s) à la conversation #${conversation.id}` +
        ` du dossier ${dossier.dossier_number}` +
        ` [${toAdd.map(e => e.id).join(', ')}]`,
    );

    // Notifier chaque nouveau collaborateur en in-app + e-mail
    const newCollabUserIds = toAdd
      .map((emp) => (emp as any).user_id ?? (emp as any).user?.id)
      .filter(Boolean);
    if (newCollabUserIds.length > 0) {
      const mailDossier = (await this.load(dossier.id, event).catch(() => null)) ?? dossier;

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
        emailContext: buildEntityMailContext({
          dossier: mailDossier,
          resourceType: 'dossier',
          resource: mailDossier as any,
        }),
      });
    }
  }

  // ── Helpers de rechargement (pattern uniformisé avec DiligenceSubscriber) ──

  private load(
    id: number,
    event?: InsertEvent<Dossier> | UpdateEvent<Dossier>,
  ): Promise<Dossier | null> {
    return this.loadEntity<Dossier>(id, {
      relations: ['client', 'lawyer', 'collaborators'],
    }, event);
  }

  private loadWithConversation(
    id: number,
    event?: InsertEvent<Dossier> | UpdateEvent<Dossier>,
  ): Promise<Dossier | null> {
    return this.loadEntity<Dossier>(id, {
      relations: ['collaborators', 'conversation', 'conversation.participants'],
    }, event);
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
