// conversation-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import type { ReferencedEntityContext } from './dto/ask-question.dto';

@Injectable()
export class ConversationManagerService {
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
  async createConversation(userId: string, title?: string): Promise<Conversation> {
    const conversation = this.conversationRepo.create({
      id: uuidv4(),
      userId,
      title: title || 'Nouvelle conversation',
      status: 'active'
    });
    
    const saved = await this.conversationRepo.save(conversation);
    this.logger.log(`📝 Nouvelle conversation créée: ${saved.id} pour user ${userId}`);
    return saved;
  }

  /**
   * Récupère l'historique complet d'une conversation (format LangChain)
   */
  async getHistory(conversationId: string): Promise<Array<{role: string, content: string}>> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' }
    });
    
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
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
  ): Promise<ConversationMessage> {
    const message = this.messageRepo.create({
      conversationId,
      role,
      content,
      reasoningContent,
      tokensUsed: tokensUsed || this.estimateTokens(content),
      references: references?.length ? references : undefined,
    });
    
    const saved = await this.messageRepo.save(message);
    
    // Mettre à jour updated_at de la conversation
    await this.conversationRepo.update(conversationId, { updated_at: new Date() });
    
    return saved;
  }

  /**
   * Initialise le contexte système avec le schéma (une seule fois par conversation)
   */
  async initializeSystemContext(conversationId: string, schema: string): Promise<void> {
    // Vérifier si le message système existe déjà
    const existing = await this.messageRepo.findOne({
      where: { conversationId, role: 'system' }
    });
    
    if (!existing) {
      const systemMessage = this.buildSystemPrompt(schema);
      await this.addMessage(conversationId, 'system', systemMessage);
      this.logger.log(`🎯 Contexte système initialisé pour conv ${conversationId}`);
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
   * Liste les conversations d'un utilisateur
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepo.find({
      where: { userId, status: 'active' },
      order: { updated_at: 'DESC' }
    });
  }

  /**
   * Nettoie l'historique trop long (garde seulement les X derniers messages)
   * À appeler après chaque ajout si la conversation dépasse un seuil
   */
  async trimHistory(conversationId: string, maxMessages: number = 20): Promise<void> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' }
    });
    
    if (messages.length > maxMessages) {
      // Garder le message système + les (maxMessages - 1) derniers
      const systemMsg = messages.find(m => m.role === 'system');
      const recent = messages.slice(-(maxMessages - 1));
      
      const toKeep = systemMsg ? [systemMsg, ...recent] : recent;
      const toDelete = messages.filter(m => !toKeep.includes(m));
      
      for (const msg of toDelete) {
        await this.messageRepo.delete(msg.id);
      }
      
      this.logger.log(`✂️ Historique tronqué: ${messages.length} → ${toKeep.length} messages`);
    }
  }

  private estimateTokens(text: string): number {
    // Approximation simple : ~4 caractères par token
    return Math.ceil(text.length / 4);
  }

   /**
   * Vérifie si la conversation a déjà un message système
   */
  async hasSystemMessage(conversationId: string): Promise<boolean> {
    const count = await this.messageRepo.count({
      where: { conversationId, role: 'system' }
    });
    return count > 0;
  }

  /**
   * Ajoute un message système
   */
  async addSystemMessage(conversationId: string, content: string): Promise<void> {
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
    await this.addMessage(conversationId, 'user', content, undefined, undefined, references);
  }

  /**
   * Ajoute un message assistant
   */
  async addAssistantMessage(conversationId: string, content: string, reasoningContent?: string): Promise<void> {
    await this.addMessage(conversationId, 'assistant', content, reasoningContent);
  }

  /**
   * Récupère l'historique complet au format LangChain
   */
  async getFullHistory(conversationId: string): Promise<Array<{
    id: number;
    role: string;
    content: string;
    created_at: Date;
    references?: ReferencedEntityContext[];
  }>> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' }
    });
    
    // Ne JAMAIS injecter le reasoningContent dans l'historique de conversation :
    // cela double le nombre de tokens et injecte du bruit (raisonnement interne du modèle).
    return messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
      references: msg.references,
    }));
  }

  /**
   * Retourne uniquement les derniers messages utiles pour un prompt LLM.
   * Les messages system sont exclus car le service AiDatabase reconstruit un
   * prompt system a jour a chaque appel (schema, tenant, documents).
   */
  async getRecentHistoryForPrompt(
    conversationId: string,
    options: { maxMessages?: number; maxTokens?: number } = {},
  ): Promise<Array<{role: string, content: string}>> {
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
      const messageTokens = msg.tokensUsed || this.estimateTokens(msg.content);
      if (selected.length >= maxMessages || (selected.length > 0 && tokens + messageTokens > maxTokens)) {
        break;
      }
      selected.push(msg);
      tokens += messageTokens;
    }

    return selected.reverse().map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Récupère une conversation active par son ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({
      where: { id: conversationId, status: 'active' }
    });
  }

  /**
   * Récupère une conversation (tous statuts) — pour la validation d'ownership.
   * Évite de retourner 401 quand la conversation est archivée (→ 404 à la place).
   */
  async getConversationAny(conversationId: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({
      where: { id: conversationId }
    });
  }

  /**
   * Ré-associe une conversation anonyme à l'utilisateur maintenant authentifié.
   */
  async reassignConversation(conversationId: string, userId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { userId });
    this.logger.log(`🔄 Conversation ${conversationId} ré-associée à user ${userId}`);
  }

  /**
   * Met à jour le titre d'une conversation
   */
  async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { title });
    this.logger.log(`📝 Titre mis à jour pour conv ${conversationId}: "${title}"`);
  }

  /**
   * Nettoie l'historique si trop long
   */
  async trimHistoryIfNeeded(conversationId: string, maxMessages: number = 20): Promise<void> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { created_at: 'ASC' }
    });
    
    if (messages.length > maxMessages) {
      // Garder le message système + les (maxMessages - 1) derniers
      const systemMsg = messages.find(m => m.role === 'system');
      const recent = messages.slice(-(maxMessages - 1));
      
      const toKeep = systemMsg ? [systemMsg, ...recent] : recent;
      const toDelete = messages.filter(m => !toKeep.includes(m));
      
      for (const msg of toDelete) {
        await this.messageRepo.delete(msg.id);
      }
      
      this.logger.log(`✂️ Conversation ${conversationId}: ${messages.length} → ${toKeep.length} messages`);
    }
  }
}
