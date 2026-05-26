import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { Dossier } from '../entities/dossier.entity';
import { Conversation } from 'src/modules/chat/entities/conversation.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import { BaseEntitySubscriber } from 'src/core/subscribers/base-entity.subscriber';

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
export class DossierSubscriber extends BaseEntitySubscriber<Dossier> {
  constructor(
    dataSource: DataSource,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepo: Repository<ProcedureType>,
    private readonly procedureInstanceService: ProcedureInstanceService,
  ) {
    super(dataSource);
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

    if (!subtype?.procedure_template_id) {
      this.logger.warn(
        `Dossier ${entity.dossier_number} : le sous-type #${entity.procedure_subtype_id} n'a pas de template — aucune instance créée`,
      );
      return;
    }

    const instance = await this.procedureInstanceService.create(
      {
        templateId: subtype.procedure_template_id,
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

    // Exemple d'extension future :
    // if (this.hasColumnChanged(event, 'status')) {
    //   await this.onStatusChanged(event);
    // }
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

    const dossier = await this.dossierRepo.findOne({
      where: { id: dossierId },
      relations: ['collaborators', 'conversation', 'conversation.participants'],
    });

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
  }
}
