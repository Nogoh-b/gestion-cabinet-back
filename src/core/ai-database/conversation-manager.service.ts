import { AsyncLocalStorage } from 'node:async_hooks';
// conversation-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { v4 as uuidv4 } from 'uuid';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import type { ReferencedEntityContext } from './dto/ask-question.dto';
import { pickConversationResource } from './conversation-resource';
import { addTenantCondition } from '../tenant/tenant-repository.patch';

@Injectable()
export class ConversationManagerService {
  // Ce contexte est limité à la requête et isolé entre utilisateurs concurrents.
  // L'historique visible des questions suivantes est fourni par le navigateur.
  private readonly temporarySession = new AsyncLocalStorage<{
    conversation: Conversation | null;
  }>();

  runTemporary<T>(callback: () => T): T {
    return this.temporarySession.run({ conversation: null }, callback);
  }

  private readonly logger = new Logger(ConversationManagerService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private messageRepo: Repository<ConversationMessage>,
  ) {}

  /**
   * Crée une nouvelle conversation
   */
  async createConversation(
    userId: string,
    title?: string,
  ): Promise<Conversation> {
    const temporary = this.temporarySession.getStore();
    if (temporary) {
      temporary.conversation ??= Object.assign(new Conversation(), {
        id: uuidv4(), userId, title: title || 'Nouvelle conversation', status: 'active',
      });
      return temporary.conversation;
    }
    const conversation = this.conversationRepo.create({
      id: uuidv4(),
      userId,
      title: title || 'Nouvelle conversation',
      status: 'active',
    });

    const saved = await this.conversationRepo.save(conversation);
    this.logger.log(
      `📝 Nouvelle conversation créée: ${saved.id} pour user ${userId}`,
    );
    return saved;
  }

  /**
   * Récupère l'historique complet d'une conversation (format LangChain)
   */
  async getHistory(
    conversationId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' },
    });

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Ajoute un message à une conversation
   */
  async addMessage(
    conversationId: string,
    role: 'system' | 'user' | 'assistant',
    content: string,
    reasoningContent?: string,
    tokensUsed?: number,
    references?: ReferencedEntityContext[],
    metadata?: Record<string, any>,
  ): Promise<ConversationMessage> {
    if (this.temporarySession.getStore()) {
      return Object.assign(new ConversationMessage(), { conversationId, role, content });
    }
    const message = this.messageRepo.create({
      conversationId,
      role,
      content,
      reasoningContent,
      tokensUsed: tokensUsed || this.estimateTokens(content),
      references: references?.length ? references : undefined,
      metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
    });

    const saved = await this.messageRepo.save(message);

    // Mettre à jour updated_at de la conversation
    await this.conversationRepo.update(conversationId, {
      updated_at: new Date(),
    });

    return saved;
  }

  /**
   * Initialise le contexte système avec le schéma (une seule fois par conversation)
   */
  async initializeSystemContext(
    conversationId: string,
    schema: string,
  ): Promise<void> {
    if (this.temporarySession.getStore()) return;
    // Vérifier si le message système existe déjà
    const existing = await this.messageRepo.findOne({
      where: { conversationId, role: 'system' },
    });

    if (!existing) {
      const systemMessage = this.buildSystemPrompt(schema);
      await this.addMessage(conversationId, 'system', systemMessage);
      this.logger.log(
        `🎯 Contexte système initialisé pour conv ${conversationId}`,
      );
    }
  }

  /**
   * Construit le prompt système
   */
  private buildSystemPrompt(schema: string): string {
    return `Tu es un expert SQL pour une base de données juridique.

Voici le schéma COMPLET de la base :

${schema}

RÈGLES ABSOLUES :
1. IGNORE toujours les colonnes "deleted_at", "deleted_by", "deleted_date"
2. Ajoute systématiquement LIMIT 50
3. Utilise des alias courts
4. Ne génère JAMAIS de DELETE, UPDATE, INSERT
5. TOUTES les valeurs doivent être en dur (pas de placeholders :id, ?, etc.)

🎯 FORMAT DE RÉPONSE OBLIGATOIRE :
Tu DOIS répondre UNIQUEMENT avec un bloc de code SQL comme ceci :

\`\`\`sql
SELECT * FROM dossiers WHERE reference = 'ABC123' LIMIT 50;
\`\`\`

Ne réponds PAS avec du texte explicatif. Juste le bloc SQL.`;
  }

  /**
   * Archive une conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { status: 'archived' });
  }

  /**
   * Liste les conversations d'un utilisateur : épinglées d'abord, puis les plus
   * récentes. `search` porte sur le titre et le texte des échanges.
   */
  async listConversations(
    userId: string,
    filters: { search?: string; resourceType?: string; resourceId?: string } = {},
  ): Promise<Conversation[]> {
    let qb = this.conversationRepo
      .createQueryBuilder('c')
      .where('c.user_id = :userId', { userId })
      .andWhere("c.status = 'active'");
    qb = addTenantCondition(qb, 'c');

    const search = String(filters.search ?? '').trim().slice(0, 100);
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      qb = qb.andWhere(
        new Brackets((where) => {
          where.where('c.title LIKE :pattern', { pattern }).orWhere(
            `EXISTS (SELECT 1 FROM conversation_messages m
                      WHERE m.conversation_id = c.id
                        AND m.role IN ('user', 'assistant')
                        AND m.deleted_at IS NULL
                        AND m.content LIKE :pattern)`,
            { pattern },
          );
        }),
      );
    }
    if (filters.resourceType && filters.resourceId) {
      qb = qb
        .andWhere('c.resource_type = :resourceType', { resourceType: filters.resourceType })
        .andWhere('c.resource_id = :resourceId', { resourceId: String(filters.resourceId) });
    }

    return qb
      .orderBy('c.pinned_at IS NULL', 'ASC')
      .addOrderBy('c.pinned_at', 'DESC')
      .addOrderBy('c.updated_at', 'DESC')
      .limit(200)
      .getMany();
  }

  /**
   * Organiser l'historique (renommer, épingler, supprimer, restaurer) ne
   * change pas la date d'activité : `updated_at = updated_at` neutralise
   * ON UPDATE CURRENT_TIMESTAMP, la conversation garde sa place et son groupe.
   */
  private async updateKeepingActivity(
    conversationId: string,
    values: QueryDeepPartialEntity<Conversation>,
  ): Promise<void> {
    await this.conversationRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({ ...values, updated_at: () => 'updated_at' })
      .where('id = :conversationId', { conversationId })
      .execute();
  }

  /** Renomme une conversation (titre déjà normalisé par l'appelant). */
  async renameConversation(conversationId: string, title: string): Promise<void> {
    await this.updateKeepingActivity(conversationId, { title });
  }

  async setPinned(conversationId: string, pinned: boolean): Promise<void> {
    await this.updateKeepingActivity(conversationId, { pinnedAt: pinned ? new Date() : null });
  }

  /** Suppression logique : la conversation peut être restaurée (« Annuler »). */
  async softDeleteConversation(conversationId: string): Promise<void> {
    await this.updateKeepingActivity(conversationId, { deleted_at: () => 'CURRENT_TIMESTAMP(6)' });
  }

  async restoreConversation(conversationId: string): Promise<void> {
    // Requête directe : un UPDATE TypeORM ajoute « deleted_at IS NULL » et ne
    // trouverait jamais la conversation supprimée (propriété vérifiée en amont).
    await this.conversationRepo.query(
      'UPDATE conversations_bot SET deleted_at = NULL, updated_at = updated_at WHERE id = ?',
      [conversationId],
    );
  }

  /** Rattache la conversation à la première fiche citée, une seule fois. */
  private async attachConversationResource(
    conversationId: string,
    references?: ReferencedEntityContext[],
  ): Promise<void> {
    if (this.temporarySession.getStore()) return;
    const resource = pickConversationResource(references);
    if (!resource) return;
    await this.conversationRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({
        resourceType: resource.type,
        resourceId: resource.id,
        resourceLabel: resource.label,
      })
      .where('id = :conversationId', { conversationId })
      .andWhere('resource_type IS NULL')
      .execute();
  }

  /**
   * Nettoie l'historique trop long (garde seulement les X derniers messages)
   * À appeler après chaque ajout si la conversation dépasse un seuil
   */
  async trimHistory(
    conversationId: string,
    maxMessages: number = 20,
  ): Promise<void> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' },
    });

    if (messages.length > maxMessages) {
      // Garder le message système + les (maxMessages - 1) derniers
      const systemMsg = messages.find((m) => m.role === 'system');
      const recent = messages.slice(-(maxMessages - 1));

      const toKeep = systemMsg ? [systemMsg, ...recent] : recent;
      const toDelete = messages.filter((m) => !toKeep.includes(m));

      for (const msg of toDelete) {
        await this.messageRepo.delete(msg.id);
      }

      this.logger.log(
        `✂️ Historique tronqué: ${messages.length} → ${toKeep.length} messages`,
      );
    }
  }

  private estimateTokens(text: string): number {
    // Approximation simple : ~4 caractères par token
    return Math.ceil(text.length / 4);
  }

  private normalizeJsonValue<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value as T;
  }

  private buildConversationTitle(content: string): string {
    const cleaned = String(content ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return 'Nouvelle conversation';
    return cleaned.length > 60 ? `${cleaned.slice(0, 60)}...` : cleaned;
  }

  private async updateTitleFromFirstUserMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    if (this.temporarySession.getStore()) return;
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });
    if (!conversation) return;
    const title = String(conversation.title ?? '').trim();
    if (title && title !== 'Nouvelle conversation') return;
    await this.conversationRepo.update(conversationId, {
      title: this.buildConversationTitle(content),
      updated_at: new Date(),
    });
  }

  /**
   * Vérifie si la conversation a déjà un message système
   */
  async hasSystemMessage(conversationId: string): Promise<boolean> {
    if (this.temporarySession.getStore()) return false;
    const count = await this.messageRepo.count({
      where: { conversationId, role: 'system' },
    });
    return count > 0;
  }

  /**
   * Ajoute un message système
   */
  async addSystemMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    await this.addMessage(conversationId, 'system', content);
  }

  /**
   * Ajoute un message utilisateur
   */
  async addUserMessage(
    conversationId: string,
    content: string,
    references?: ReferencedEntityContext[],
  ): Promise<void> {
    await this.addMessage(
      conversationId,
      'user',
      content,
      undefined,
      undefined,
      references,
    );
    await this.updateTitleFromFirstUserMessage(conversationId, content);
    await this.attachConversationResource(conversationId, references);
  }

  /**
   * Ajoute un message assistant
   */
  async addAssistantMessage(
    conversationId: string,
    content: string,
    reasoningContent?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.addMessage(
      conversationId,
      'assistant',
      content,
      reasoningContent,
      undefined,
      undefined,
      metadata,
    );
  }

  /**
   * Récupère l'historique complet au format LangChain
   */
  async getFullHistory(conversationId: string): Promise<
    Array<{
      id: number;
      role: string;
      content: string;
      created_at: Date;
      references?: ReferencedEntityContext[];
      metadata?: Record<string, any>;
      sqlQuery?: string;
      results?: any;
      rowCount?: number;
      recommendations?: string[];
      fileInfo?: any;
    }>
  > {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' },
    });

    // Ne JAMAIS injecter le reasoningContent dans l'historique de conversation :
    // cela double le nombre de tokens et injecte du bruit (raisonnement interne du modèle).
    return messages.map((msg) => {
      const metadata = this.normalizeJsonValue<Record<string, any>>(
        msg.metadata,
        {},
      );
      const references = this.normalizeJsonValue<ReferencedEntityContext[]>(
        msg.references,
        [],
      );
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        references,
        metadata,
        sqlQuery: metadata.sqlQuery,
        results: metadata.results,
        rowCount: metadata.rowCount,
        recommendations: metadata.recommendations,
        fileInfo: metadata.fileInfo,
      };
    });
  }

  private formatMessageForPrompt(msg: ConversationMessage): {
    role: string;
    content: string;
  } {
    const metadata = this.normalizeJsonValue<Record<string, any>>(
      msg.metadata,
      {},
    );
    let content = msg.content;

    if (msg.role === 'assistant') {
      const context = this.buildAssistantResultContext(metadata);
      if (context) {
        content = `${content}\n\n${context}`;
      }
    }

    return {
      role: msg.role,
      content,
    };
  }

  private buildAssistantResultContext(metadata: Record<string, any>): string {
    const sqlQuery =
      typeof metadata.sqlQuery === 'string' ? metadata.sqlQuery.trim() : '';
    const rowCount =
      typeof metadata.rowCount === 'number' ? metadata.rowCount : undefined;
    const rows = Array.isArray(metadata.results)
      ? metadata.results.slice(0, 3)
      : [];

    if ((rowCount ?? 0) === 0 && rows.length === 0) return '';
    if (!sqlQuery && rows.length === 0 && rowCount === undefined) return '';

    const lines: string[] = [
      '[CONTEXTE STRUCTURE POUR LES QUESTIONS DE SUIVI]',
    ];
    if (sqlQuery) {
      lines.push(
        `SQL precedent: ${sqlQuery.replace(/\s+/g, ' ').substring(0, 600)}`,
      );
    }
    if (rowCount !== undefined) {
      lines.push(`Nombre de lignes precedent: ${rowCount}`);
    }
    if (rows.length > 0) {
      lines.push('Resultats cles precedents:');
      rows.forEach((row, index) => {
        lines.push(
          `- ligne ${index + 1}: ${this.formatResultRowForPrompt(row)}`,
        );
      });
    }
    lines.push(
      'Instruction: pour "ce/cette/cet" element, reutilise ces identifiants et filtres exacts; ne devine pas un autre numero.',
    );

    return lines.join('\n');
  }

  private formatResultRowForPrompt(row: Record<string, any>): string {
    const priorityKeys = [
      'id',
      'uuid',
      'numero',
      'number',
      'reference',
      'dossier_id',
      'dossier_number',
      'client_id',
      'customer_id',
      'invoice_id',
      'facture_id',
      'paiement_id',
      'jurisdiction_id',
      'invoice_type_id',
      'type',
      'status',
      'first_name',
      'last_name',
      'company_name',
      'name',
      'title',
      'object',
      'description',
      'date_facture',
      'date_echeance',
      'montant_ht',
      'montant_ttc',
      'amount',
      'currency',
      'tenant_id',
    ];
    const entries: string[] = [];
    const seen = new Set<string>();

    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        entries.push(`${key}=${this.formatPromptValue(row[key])}`);
        seen.add(key);
      }
    }

    for (const [key, value] of Object.entries(row)) {
      if (entries.length >= 25) break;
      if (seen.has(key)) continue;
      if (
        key.endsWith('_id') ||
        key.endsWith('_number') ||
        key.includes('numero')
      ) {
        entries.push(`${key}=${this.formatPromptValue(value)}`);
      }
    }

    return entries.join(', ') || JSON.stringify(row).substring(0, 500);
  }

  private formatPromptValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object')
      return JSON.stringify(value).substring(0, 120);
    return String(value).replace(/\s+/g, ' ').substring(0, 120);
  }

  /**
   * Retourne uniquement les derniers messages utiles pour un prompt LLM.
   * Les messages system sont exclus car le service AiDatabase reconstruit un
   * prompt system a jour a chaque appel (schema, tenant, documents).
   */
  async getRecentHistoryForPrompt(
    conversationId: string,
    options: { maxMessages?: number; maxTokens?: number } = {},
  ): Promise<Array<{ role: string; content: string }>> {
    if (this.temporarySession.getStore()) return [];
    const maxMessages = options.maxMessages ?? 8;
    const maxTokens = options.maxTokens ?? 8000;

    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'DESC' },
      take: Math.max(maxMessages * 3, maxMessages),
    });

    const selected: ConversationMessage[] = [];
    let tokens = 0;

    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const promptMessage = this.formatMessageForPrompt(msg);
      const messageTokens = this.estimateTokens(promptMessage.content);
      if (
        selected.length >= maxMessages ||
        (selected.length > 0 && tokens + messageTokens > maxTokens)
      ) {
        break;
      }
      selected.push(msg);
      tokens += messageTokens;
    }

    return selected.reverse().map((msg) => this.formatMessageForPrompt(msg));
  }

  /**
   * Retourne le bloc structuré de contexte de suivi (SQL + lignes de résultats
   * avec identifiants exacts) construit à partir du dernier message assistant
   * porteur de résultats. Sert à ancrer les questions de suivi quand le chemin
   * `historyOverride` (chat) court-circuite getRecentHistoryForPrompt.
   *
   * @returns le bloc [CONTEXTE STRUCTURE POUR LES QUESTIONS DE SUIVI] ou null.
   */
  async getStructuredFollowUpContext(
    conversationId: string,
  ): Promise<string | null> {
    if (this.temporarySession.getStore()) return null;
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'DESC' },
      take: 12,
    });

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const metadata = this.normalizeJsonValue<Record<string, any>>(
        msg.metadata,
        {},
      );
      const block = this.buildAssistantResultContext(metadata);
      if (block) return block;
    }
    return null;
  }

  /**
   * Récupère une conversation active par son ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const temporary = this.temporarySession.getStore();
    if (temporary) return temporary.conversation;
    return this.conversationRepo.findOne({
      where: { id: conversationId, status: 'active' },
    });
  }

  /**
   * Récupère une conversation (tous statuts) — pour la validation d'ownership.
   * Évite de retourner 401 quand la conversation est archivée (→ 404 à la place).
   */
  async getConversationAny(
    conversationId: string,
    options: { withDeleted?: boolean } = {},
  ): Promise<Conversation | null> {
    const temporary = this.temporarySession.getStore();
    if (temporary) return temporary.conversation;
    return this.conversationRepo.findOne({
      where: { id: conversationId },
      withDeleted: options.withDeleted ?? false,
    });
  }

  /**
   * Ré-associe une conversation anonyme à l'utilisateur maintenant authentifié.
   */
  async reassignConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await this.conversationRepo.update(conversationId, { userId });
    this.logger.log(
      `🔄 Conversation ${conversationId} ré-associée à user ${userId}`,
    );
  }

  /**
   * Met à jour le titre d'une conversation
   */
  async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<void> {
    if (this.temporarySession.getStore()) return;
    await this.conversationRepo.update(conversationId, { title });
    this.logger.log(
      `📝 Titre mis à jour pour conv ${conversationId}: "${title}"`,
    );
  }

  /**
   * Nettoie l'historique si trop long
   */
  async trimHistoryIfNeeded(
    conversationId: string,
    maxMessages: number = 20,
  ): Promise<void> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' },
    });

    if (messages.length > maxMessages) {
      // Garder le message système + les (maxMessages - 1) derniers
      const systemMsg = messages.find((m) => m.role === 'system');
      const recent = messages.slice(-(maxMessages - 1));

      const toKeep = systemMsg ? [systemMsg, ...recent] : recent;
      const toDelete = messages.filter((m) => !toKeep.includes(m));

      for (const msg of toDelete) {
        await this.messageRepo.delete(msg.id);
      }

      this.logger.log(
        `✂️ Conversation ${conversationId}: ${messages.length} → ${toKeep.length} messages`,
      );
    }
  }
}
