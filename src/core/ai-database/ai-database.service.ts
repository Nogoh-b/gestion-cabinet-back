import * as fs from 'fs';
import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, Repository } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

























import { DocumentCustomer } from '../../modules/documents/document-customer/entities/document-customer.entity';
import { getCurrentTenantId, hasActiveTenant } from '../tenant/tenant.context';
import { isSharedEntity } from '../tenant/tenant.decorator';
import { AiDatabasePermissionService, AiUserContext } from './ai-database-permission.service';
import { AI_DATABASE_PROJECT_CONFIG } from './ai-database.tokens';
import { AiModelProfile, AiModelRouterService } from './ai-model-router.service';
import { buildAiCacheKey } from './ai-cache-key.util';
import { DatabaseTablesConfig } from './config/database-tables.config';
import { ConversationManagerService } from './conversation-manager.service';
import { AnalysisResponseDto, ReadClarificationContext, WritePlan } from './dto/analysis-response.dto';
import { AskQuestionDto, parseReferencedContext, parseVisibleHistory, ReferencedEntityContext, VisibleHistoryMessage } from './dto/ask-question.dto';
import { GenericWriteService } from './generic-write.service';
import { IntentDetectionService } from './intent-detection.service';
import { ColumnSchema, DatabaseSchema, TableSchema } from './interface/schema.interface';
import { AiDatabaseProjectConfig } from './interfaces/ai-database-project-config.interface';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';
import { AiRequestLog } from './entities/ai-request-log.entity';
import { AmbiguityException } from './write/ambiguity.exception';
import { EntityIdRequiredException } from './write/entity-id-required.exception';
import { WriteHandlerRegistry, WriteResult } from './write/write-handler.registry';












type IntentMode = 'auto' | 'read' | 'write' | 'chat';

interface DocumentContextItem {
  id?: number;
  name: string;
  type?: string;
  size?: number;
  source: 'upload' | 'system';
  content: string;
  truncated: boolean;
  error?: string;
}

interface RequestContext {
  enrichedQuestion: string;
  fileInfo?: any;
  documentContext: DocumentContextItem[];
  referenced: ReferencedEntityContext[];
}

interface AiRequestMetrics {
  logId?: number;
  startedAt: number;
  requestType: string;
  firstTokenMs?: number;
  llmCalls: number;
  estimatedPromptTokens: number;
  outputChars: number;
  intent?: string;
  models: Set<string>;
  cacheHit: boolean;
  status: 'started' | 'success' | 'error';
}














@Injectable()
export class AiDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(AiDatabaseService.name);
  private llm!: ChatOpenAI;
  private readonly metricsStorage = new AsyncLocalStorage<AiRequestMetrics>();
  private schemaCache: Map<string, { schema: string; timestamp: number }> = new Map();
  private schemaJsonCache: Map<string, { value: DatabaseSchema; timestamp: number }> = new Map();
  private tableDetectionCache: Map<string, { tables: string[]; timestamp: number }> = new Map();
  private sqlGenerationCache: Map<string, { sql: string; timestamp: number }> = new Map();
  private relationshipsCache: Map<string, any> = new Map();
  private columnLabelsCache: Map<string, any> = new Map();
  /**
   * Plans WRITE en attente d'un identifiant (EntityIdRequiredException) gardés
   * en mémoire par conversationId, pour ne pas « perdre le fil » quand l'IA
   * demande à l'utilisateur de préciser quelle entité elle doit modifier.
   * Au message suivant dans la même conversation, on tente d'extraire un ID
   * numérique de la réponse de l'utilisateur et de relancer le plan complété.
   */
  private pendingEntityIdClarifications: Map<string, {
    plan: WritePlan; operationIndex: number; entity: string; userId: string; createdAt: number;
  }> = new Map();
  private readonly PENDING_CLARIFICATION_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly CACHE_TTL = 3600000; // 1 heure
  private readonly MAX_RESULTS = 50;
  private readonly MAX_TOKENS = 4000;
  private readonly MAX_CHARS = 180000;
  private readonly MAX_HISTORY_MESSAGES = 4;
  private readonly MAX_HISTORY_TOKENS = 2200;
  private readonly MAX_FILE_CONTEXT_CHARS = 12000;
  private readonly MAX_DOCUMENT_CONTEXT_CHARS = 16000;
  private readonly MAX_SYSTEM_DOCUMENTS = 5;
  private schemaInitialized = false;
  private readonly SCHEMA_CACHE_KEY = 'database_schema_context';
  private schemaLoaded = false;
  private cachedSystemPrompt: string | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(DocumentCustomer)
    private readonly documentRepository: Repository<DocumentCustomer>,
    @InjectRepository(AiRequestLog)
    private readonly aiRequestLogRepository: Repository<AiRequestLog>,
    private readonly aiModelRouter: AiModelRouterService,
    private readonly schemaMetadata: SchemaMetadataService,
    private readonly sqlValidator: SqlValidatorService,
    private readonly intentDetectionService: IntentDetectionService,
    private readonly genericWriteService: GenericWriteService,
    private readonly conversationManager: ConversationManagerService,
    private readonly writeHandlerRegistry: WriteHandlerRegistry,
    private readonly aiPermissionService: AiDatabasePermissionService,
    @Optional() @Inject(AI_DATABASE_PROJECT_CONFIG)
    private readonly projectConfig?: AiDatabaseProjectConfig,
  ) {}

  private getUserId(user: AiUserContext | string | number | undefined | null): string {
    if (typeof user === 'string' || typeof user === 'number') return String(user);
    return String(user?.id ?? user?.userId ?? 'anonymous');
  }

  private async withAiMetrics<T>(
    requestType: string,
    logId: number | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const metrics: AiRequestMetrics = {
      logId,
      startedAt: Date.now(),
      requestType,
      llmCalls: 0,
      estimatedPromptTokens: 0,
      outputChars: 0,
      models: new Set<string>(),
      cacheHit: false,
      status: 'started',
    };

    return this.metricsStorage.run(metrics, async () => {
      try {
        const result = await fn();
        if (metrics.status === 'started') metrics.status = 'success';
        return result;
      } catch (error) {
        metrics.status = 'error';
        throw error;
      } finally {
        await this.flushAiMetrics(metrics);
      }
    });
  }

  private markMetric(patch: Partial<Pick<AiRequestMetrics, 'intent' | 'cacheHit' | 'status'>>): void {
    const metrics = this.metricsStorage.getStore();
    if (!metrics) return;
    Object.assign(metrics, patch);
  }

  private recordLlmCall(profile: AiModelProfile, input: unknown): void {
    const metrics = this.metricsStorage.getStore();
    if (!metrics) return;
    metrics.llmCalls += 1;
    metrics.estimatedPromptTokens += this.aiModelRouter.estimateTokens(input);
    metrics.models.add(this.aiModelRouter.getModelName(profile));
  }

  private recordOutput(text: string, token = false): void {
    const metrics = this.metricsStorage.getStore();
    if (!metrics) return;
    if (token && metrics.firstTokenMs === undefined) {
      metrics.firstTokenMs = Date.now() - metrics.startedAt;
    }
    metrics.outputChars += text.length;
  }

  private async invokeModel(profile: AiModelProfile, input: unknown, maxTokens?: number): Promise<any> {
    this.recordLlmCall(profile, input);
    const response = await this.aiModelRouter.invoke(profile, input, maxTokens);
    this.recordOutput(this.extractLlmText(response));
    return response;
  }

  private async streamModel(profile: AiModelProfile, input: unknown, maxTokens?: number): Promise<any> {
    this.recordLlmCall(profile, input);
    return this.aiModelRouter.stream(profile, input, maxTokens);
  }

  private trackExternalLlmCall = (info: { profile: AiModelProfile; input: unknown; modelName?: string }) => {
    const metrics = this.metricsStorage.getStore();
    if (!metrics) return;
    metrics.llmCalls += 1;
    metrics.estimatedPromptTokens += this.aiModelRouter.estimateTokens(info.input);
    metrics.models.add(info.modelName || this.aiModelRouter.getModelName(info.profile));
  };

  private extractLlmText(response: any): string {
    const content = response?.content ?? response;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((item: any) => item?.text ?? item?.content ?? item ?? '').join('');
    }
    return String(content ?? '');
  }

  private extractChunkText(chunk: any): string {
    if (!chunk) return '';
    const content = chunk.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((block: any) => block?.type === 'text' || typeof block === 'string' || block?.text)
        .map((block: any) => block?.text ?? (typeof block === 'string' ? block : ''))
        .join('');
    }
    if (typeof chunk === 'string') return chunk;
    if (chunk.text) return String(chunk.text);
    return '';
  }

  private async flushAiMetrics(metrics: AiRequestMetrics): Promise<void> {
    if (!metrics.logId) return;
    try {
      await this.aiRequestLogRepository.update(metrics.logId, {
        total_ms: Date.now() - metrics.startedAt,
        first_token_ms: metrics.firstTokenMs ?? null,
        llm_calls: metrics.llmCalls,
        estimated_prompt_tokens: metrics.estimatedPromptTokens,
        output_chars: metrics.outputChars,
        request_type: metrics.requestType,
        intent: metrics.intent ?? null,
        model: Array.from(metrics.models).join(',').substring(0, 128) || null,
        cache_hit: metrics.cacheHit,
        status: metrics.status,
      });
    } catch (error) {
      this.logger.warn(`Impossible de mettre a jour les metriques IA: ${(error as Error).message}`);
    }
  }

  async onModuleInit() {
    await this.initializeLLM();
    await this.loadDatabaseRelationships();
    await this.schemaMetadata.initializeMetadata();
    
    // ✅ CRUCIAL : Initialiser le contexte avec le schéma
    // await this.initializeSchemaContext();
     await this.preloadSystemPrompt();

    this.logger.log('✅ Service AI Database initialisé avec Thinking Mode');
  }


    /**
   * Précharge le prompt système (schéma) une seule fois
   */
  public async preloadSystemPrompt(): Promise<any> {
    this.logger.log('🔄 Préchargement du prompt système...');
    const allTables = this.schemaMetadata.getAllVisibleTables();
    const schema = await this.getCompleteSchema(allTables);
    
        this.cachedSystemPrompt = `Tu es un expert SQL pour une base de données juridique.

    Voici le schéma COMPLET de la base :

    ${schema}

    RÈGLES ABSOLUES :
    1. IGNORE toujours les colonnes "deleted_at", "deleted_by", "deleted_date"
    2. Ajoute systématiquement LIMIT ${this.MAX_RESULTS}
    3. Utilise des alias courts
    4. Ne génère JAMAIS de DELETE, UPDATE, INSERT
    5. TOUTES les valeurs doivent être en dur (pas de placeholders :id, ?, etc.)

    🎯 FORMAT DE RÉPONSE OBLIGATOIRE :
    Tu DOIS répondre UNIQUEMENT avec un bloc de code SQL comme ceci :

    \`\`\`sql
    SELECT * FROM dossiers WHERE reference = 'ABC123' LIMIT 50;
    \`\`\`

    Ne réponds PAS avec du texte explicatif. Juste le bloc SQL et parsable. la requete doit être conforme au schéma fourni et respecter les règles énoncées.`;
   ;
        
    this.schemaLoaded = true;
    return this.cachedSystemPrompt
    // this.logger.log(`✅ Prompt système préchargé (${this.cachedSystemPrompt.length} caractères)`);
  }

  /**
   * Génère le schéma d'écriture à partir de tous les handlers enregistrés
   */
  private async getWriteSchema(): Promise<string> {
    let schema = '# 📝 OPÉRATIONS D\'ÉCRITURE DISPONIBLES\n\n';
    
    for (const handler of this.writeHandlerRegistry.getAllHandlers()) {
      const fields = await handler.getWriteableFieldsSchema();
      schema += `## ${handler.entityName}\n`;
      schema += `| Champ | Type | Requis | Description | Exemple |\n`;
      schema += `|-------|------|--------|-------------|---------|\n`;
      
      for (const field of fields) {
        schema += `| ${field.name} | ${field.type}`;
        if (field.referenceEntity) schema += ` → ${field.referenceEntity}`;
        schema += ` | ${field.required ? '✅' : '❌'} | ${field.description || ''} | ${field.example || ''} |\n`;
      }
      schema += `\n`;
    }
    
    return schema;
  }

  
  /**
   * ✅ NOUVELLE MÉTHODE : Pose une question dans une conversation spécifique
   */
  async askQuestionWithSession(
    conversationId: string,
    question: string,
    schema?: string,
    tables: string[] = [],
    historyQuestion?: string,
    references: ReferencedEntityContext[] = [],
    historyOverride: VisibleHistoryMessage[] = [],
  ): Promise<string> {
    // 1. Vérifier que la conversation existe
    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} non trouvée`);
    }

    return this.generateSqlForConversation(conversationId, question, schema, tables, historyQuestion, references, historyOverride);
  }

  /**
  * Détecte si la réponse indique qu'aucun résultat n'a été trouvé
  */
  private async generateSqlForConversation(
    conversationId: string,
    question: string,
    schema?: string,
    tables: string[] = [],
    historyQuestion?: string,
    references: ReferencedEntityContext[] = [],
    historyOverride: VisibleHistoryMessage[] = [],
  ): Promise<string> {
    const schemaToUse = schema || (await this.getCompleteSchema(
      tables.length ? tables : await this.detectRelevantTables(question, undefined, references),
    ));
    const tenantId = hasActiveTenant() ? getCurrentTenantId() : null;
    const systemPrompt = this.buildReadSystemPrompt(schemaToUse, tenantId);

    const recentHistory = historyOverride.length
      ? historyOverride.slice(-this.MAX_HISTORY_MESSAGES)
      : await this.conversationManager.getRecentHistoryForPrompt(conversationId, {
        maxMessages: this.MAX_HISTORY_MESSAGES,
        maxTokens: this.MAX_HISTORY_TOKENS,
      });
    await this.conversationManager.addUserMessage(conversationId, historyQuestion ?? question, references);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: question },
    ];
    const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    this.logger.log(`Tokens estimes prompt SQL: ${estimatedTokens} | ${messages.length} messages | tables=${tables.join(',') || 'auto'}`);

    const canUseSqlCache = recentHistory.length === 0 && references.length === 0 && !historyOverride.length;
    const sqlCacheKey = canUseSqlCache
      ? buildAiCacheKey('sql', {
          tenantId,
          question,
          tables,
          schemaLength: schemaToUse.length,
        })
      : null;
    if (sqlCacheKey) {
      const cachedSql = this.sqlGenerationCache.get(sqlCacheKey);
      if (cachedSql && Date.now() - cachedSql.timestamp < 5 * 60 * 1000) {
        this.markMetric({ cacheHit: true });
        return cachedSql.sql;
      }
    }

    const response = await this.invokeModel('quality', messages, 1200);
    const content = this.extractLlmText(response);
    this.logger.log(`Reponse SQL brute (200 chars): ${content.substring(0, 200)}`);

    let sqlQuery = this.extractSQL(content) || this.extractSQLRelaxed(content);

    if (!sqlQuery && this.isNoResultsResponse(content)) {
      sqlQuery = `-- Aucun resultat trouve pour: ${question}\nSELECT NULL AS message WHERE 1=0`;
    } else if (!sqlQuery) {
      sqlQuery = (await this.askForSQLOnly(question, schemaToUse)) || '';
    }

    if (sqlQuery) {
      const normalizedLower = sqlQuery.toLowerCase().trim();
      if (!normalizedLower.startsWith('select') && !normalizedLower.includes('--')) {
        this.logger.error(`Requete non SELECT detectee: ${sqlQuery.substring(0, 100)}`);
        sqlQuery = '';
      }
    }

    if (!sqlQuery) {
      sqlQuery = this.generateFallbackQuery(question);
      this.logger.warn(`Fallback SQL final utilise: ${sqlQuery}`);
    }

    // Normaliser les fonctions de date (CURDATE→CURDATE(), NOW→NOW(), etc.) dès la
    // source : ainsi TOUT chemin d'exécution en aval reçoit un SQL MySQL valide,
    // même si un appelant oubliait de passer par prepareReadQuery().
    sqlQuery = this.replaceSpecialValues(sqlQuery);

    const placeholders = this.findSqlPlaceholders(sqlQuery);
    if (placeholders.length > 0) {
      this.logger.warn(
        `SQL avec placeholders non resolus (${placeholders.join(', ')}) - regeneration avec contexte conversationnel`,
      );
      sqlQuery = await this.regenerateSqlWithoutPlaceholders(sqlQuery, messages, placeholders);
      sqlQuery = this.replaceSpecialValues(sqlQuery);
    }

    const remainingPlaceholders = this.findSqlPlaceholders(sqlQuery);
    if (remainingPlaceholders.length > 0) {
      this.logger.warn(`SQL conserve avec placeholders apres regeneration: ${remainingPlaceholders.join(', ')}`);
    }

    if (sqlCacheKey && remainingPlaceholders.length === 0) {
      this.sqlGenerationCache.set(sqlCacheKey, { sql: sqlQuery, timestamp: Date.now() });
    }

    return sqlQuery;
  }

  private buildReadSystemPrompt(schema: string, tenantId: number | null): string {
    const readDomainRules = this.buildReadDomainRulesBlock();
    const prompt = `Tu es un expert SQL pour une base de donnees juridique.

Voici le schema utile de la base :

${schema}

REGLES ABSOLUES :
1. Ignore toujours les colonnes deleted_at, deleted_by, deleted_date
2. Ajoute systematiquement LIMIT ${this.MAX_RESULTS}
3. Utilise des alias courts
4. Ne genere JAMAIS de DELETE, UPDATE, INSERT, DROP, ALTER, CREATE, TRUNCATE
5. Toutes les valeurs doivent etre en dur, sans placeholders (:id, ?, @param)
6. Pour une question de suivi ("cette facture", "ce dossier", "donne les details"), reutilise les contraintes metier de l'historique recent (client, statut, periode, montant, etc.). Si l'historique contient un bloc [CONTEXTE STRUCTURE POUR LES QUESTIONS DE SUIVI], utilise en priorite les identifiants exacts fournis (ex: dossier_id=40 => WHERE d.id = 40). N'utilise jamais une colonne avec ? ou un numero invente parce qu'un numero exact manque.
7. Si des documents sont fournis dans la question, utilise leur contenu uniquement comme contexte d'analyse, pas comme nom de table
8. ⚠️ IMPORTANT : Utilise EXACTEMENT les noms de tables du schema ci-dessus. Ne devine JAMAIS les noms de tables. Par exemple, la table "document_customer" s'appelle EXACTEMENT "document_customer", pas "document" ni "documents".
9. Base MySQL : pour la date du jour utilise CURDATE() (TOUJOURS avec parenthèses), pour l'instant présent NOW(). N'écris JAMAIS CURDATE, CURRENT_DATE, NOW ni SYSDATE sans parenthèses, sinon MySQL les prend pour des colonnes. Ex: WHERE a.audience_date >= CURDATE().
10. N'utilise QUE de vraies colonnes des tables ci-dessus, JAMAIS des champs calculés/libellés (ex: "Est à venir", "Statut libellé"). Pour les audiences "à venir", compare audience_date >= CURDATE() (et status = 0 si pertinent).
11. 🚫 INTERDICTION ABSOLUE D'INVENTER : tu ne peux utiliser QUE les tables et les colonnes EXACTEMENT présentes dans le schéma ci-dessus. Si une table ou une colonne dont tu aurais besoin n'y figure PAS, tu n'as PAS le droit de la deviner — ni un nom voisin "plausible" (ex: ne JAMAIS écrire "ecriture_lignes" si seul "lignes_ecriture_comptable" existe), ni des colonnes inventées (ex: ne JAMAIS inventer "sens"/"montant" si les colonnes réelles sont "debit"/"credit"). Recopie les noms caractère par caractère depuis le tableau du schéma.
12. Si les données demandées ne peuvent PAS être obtenues avec les seules tables/colonnes listées ci-dessus, NE devine PAS : réponds par une requête vide \`SELECT NULL AS message WHERE 1=0\` plutôt que de référencer un objet inexistant.

${readDomainRules}

FORMAT OBLIGATOIRE :
Reponds uniquement avec un bloc SQL parsable :

\`\`\`sql
SELECT * FROM dossiers d LIMIT ${this.MAX_RESULTS};
\`\`\``;

    if (!tenantId || tenantId === 1) return prompt;

    return `${prompt}

REGLE TENANT OBLIGATOIRE :
Cette session appartient au cabinet tenant_id = ${tenantId}.
Filtre chaque table metier tenant-aware avec tenant_id = ${tenantId}.`;
  }

  private buildReadDomainRulesBlock(): string {
    const rules = this.projectConfig?.readDomainRules?.trim();
    if (!rules) return '';
    return `REGLES METIER READ (CONFIG PROJET) :
${rules}`;
  }

  private isSyntheticEmptyQuery(sql: string): boolean {
    const cleaned = String(sql ?? '')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .replace(/;$/, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    return /^select\s+null\s+as\s+message\s+where\s+1\s*=\s*0(?:\s+limit\s+\d+)?$/.test(cleaned);
  }

  private findReadClarificationPreset(question: string) {
    const normalizedQuestion = this.normalizeForKeywordMatch(question);
    return this.projectConfig?.readClarificationPresets?.find(preset =>
      preset.keywords.some(keyword =>
        this.containsNormalizedPhrase(normalizedQuestion, this.normalizeForKeywordMatch(keyword)),
      ),
    );
  }

  private isObviousWriteQuestion(question: string): boolean {
    return this.intentDetectionService.classifyLocal(question) === 'WRITE';
  }

  private shouldForceWriteDespiteReadMode(
    intentMode: 'auto' | 'read' | 'write' | 'chat',
    originalQuestion: string,
    enrichedQuestion: string,
  ): boolean {
    return intentMode === 'read'
      && (this.isObviousWriteQuestion(originalQuestion) || this.isObviousWriteQuestion(enrichedQuestion));
  }

  private isGenericReadClarification(context: ReadClarificationContext | null): boolean {
    if (!context?.options?.length) return false;
    const genericTerms = ['details', 'detail', 'count', 'compter', 'precise', 'preciser', 'voir le detail'];
    return context.options.every(option => {
      const value = this.normalizeForKeywordMatch(`${option.id} ${option.label} ${option.description}`);
      return genericTerms.some(term => this.containsNormalizedPhrase(value, this.normalizeForKeywordMatch(term)));
    });
  }

  private async buildReadClarificationContext(
    question: string,
    enrichedQuestion: string,
    schema: string,
    tables: string[],
    context: {
      historyForIntent?: string;
      historyOverride?: VisibleHistoryMessage[];
      referenced?: ReferencedEntityContext[];
    } = {},
    reason = 'La demande READ n\'a pas permis de generer une requete SQL fiable.',
  ): Promise<ReadClarificationContext> {
    const preset = this.findReadClarificationPreset(question);
    const fallback = await this.generateReadClarificationWithModel(
      question,
      enrichedQuestion,
      schema,
      tables,
      reason,
      context,
      preset,
    );
    if (fallback && !(preset && this.isGenericReadClarification(fallback))) return fallback;

    if (preset) {
      return {
        reason: preset.reason,
        question: preset.question,
        options: preset.options,
      };
    }

    return this.buildContextualFallbackClarification(question, tables, reason);
  }

  private async generateReadClarificationWithModel(
    question: string,
    enrichedQuestion: string,
    schema: string,
    tables: string[],
    reason: string,
    context: {
      historyForIntent?: string;
      historyOverride?: VisibleHistoryMessage[];
      referenced?: ReferencedEntityContext[];
    } = {},
    preset?: {
      id: string;
      reason: string;
      question: string;
      options: Array<{
        id: string;
        label: string;
        description: string;
        followUpQuestion: string;
        specificTables?: string[];
      }>;
    },
  ): Promise<ReadClarificationContext | null> {
    const readDomainRules = this.buildReadDomainRulesBlock();
    const referencedContext = (context.referenced ?? [])
      .map(item => {
        const id = item.id ?? item.data?.id ?? '';
        return `- ${item.type}: ${item.label}${id ? ` (id=${id})` : ''}`;
      })
      .join('\n');
    const visibleHistory = (context.historyOverride ?? [])
      .slice(-8)
      .map(item => `${item.role === 'assistant' ? 'ASSISTANT' : 'UTILISATEUR'}: ${item.content}`)
      .join('\n---\n');
    const presetHint = preset
      ? `Preset metier correspondant: ${preset.id}
Question suggeree par preset: ${preset.question}
Options preset disponibles:
${preset.options.map(option =>
  `- ${option.label}: ${option.description} -> ${option.followUpQuestion} [tables=${(option.specificTables ?? []).join(',')}]`,
).join('\n')}`
      : '';
    const prompt = `Tu aides a clarifier une question READ qui n'a pas donne de requete SQL fiable.
Tu dois proposer des reformulations CONCRETES et SPECIFIQUES au domaine metier de la question.

Question utilisateur: "${question}"

Raison: ${reason}

Tables pertinentes: ${tables.join(', ') || '(non detectees)'}

Schema disponible (noms de tables et colonnes reels):
${schema.substring(0, 7000)}

${readDomainRules}

${presetHint}

Retourne uniquement un JSON valide:
{
  "reason": "phrase courte expliquant pourquoi la question est ambigue",
  "question": "question courte de clarification a afficher a l'utilisateur",
  "options": [
    {
      "id": "identifiant_snake_case",
      "label": "1 a 4 mots",
      "description": "phrase courte expliquant ce que cette option va afficher",
      "followUpQuestion": "question complete et autonome a renvoyer au backend pour generer le SQL",
      "specificTables": ["table"]
    }
  ]
}

Contraintes ABSOLUES:
- 2 a 4 options maximum.
- Chaque followUpQuestion doit etre une VRAIE question exploitable en SQL (ex: "Quel est le total des factures payees" et non "Voir le detail").
- Les options doivent etre SPECIFIQUES au sujet de la question: si l'utilisateur demande le chiffre d'affaires, propose des options sur les factures, paiements, periodes, pas des options generiques.
- INTERDIT d'inclure des references, identifiants, numeros de dossier ou noms de clients dans la question ou les options sauf si l'utilisateur les a EXPLICITEMENT mentionnes dans sa question.
- INTERDIT d'utiliser des formulations generiques comme "Voir le detail", "Compter", "Preciser autrement".
- Les followUpQuestion doivent etre autonomes: un lecteur qui ne connait pas le contexte doit pouvoir comprendre ce qu'on cherche.
- N'invente pas de table hors schema.
- Ne propose jamais une option WRITE ici: uniquement des relances READ.
- specificTables doit contenir les tables exactes du schema necessaires pour la requete.`;

    try {
      const response = await this.invokeModel('fast', [{ role: 'user', content: prompt }], 900);
      const content = this.extractLlmText(response);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as ReadClarificationContext;
      if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length === 0) {
        return null;
      }
      return {
        reason: String(parsed.reason || reason),
        question: String(parsed.question),
        options: parsed.options.slice(0, 4).map((option, index) => ({
          id: String(option.id || `option_${index + 1}`),
          label: String(option.label || `Option ${index + 1}`).substring(0, 80),
          description: String(option.description || '').substring(0, 240),
          followUpQuestion: String(option.followUpQuestion || question),
          specificTables: Array.isArray(option.specificTables)
            ? option.specificTables.map(String).filter(Boolean).slice(0, 5)
            : undefined,
        })),
      };
    } catch (error) {
      this.logger.warn(`Clarification READ generique impossible: ${(error as Error).message}`);
      return null;
    }
  }

  private isNoResultsResponse(content: string): boolean {
    const lower = content.toLowerCase();
    const noResultPatterns = [
      'aucun dossier', 'aucun résultat', 'not found', 'no results',
      'introuvable', 'existe pas', 'does not exist'
    ];
    return noResultPatterns.some(pattern => lower.includes(pattern));
  }

  private buildContextualFallbackClarification(
    question: string,
    tables: string[],
    reason: string,
  ): ReadClarificationContext {
    const normalized = this.normalizeForKeywordMatch(question);
    const domainOptions = this.detectDomainFallbackOptions(normalized, tables);

    if (domainOptions) return domainOptions;

    return {
      reason,
      question: 'Pouvez-vous preciser votre demande ?',
      options: [
        {
          id: 'list',
          label: 'Lister les resultats',
          description: 'Afficher les donnees correspondantes sous forme de liste.',
          followUpQuestion: `Affiche la liste de: ${question}`,
          specificTables: tables,
        },
        {
          id: 'total',
          label: 'Obtenir un total',
          description: 'Calculer un nombre ou une somme correspondant a la demande.',
          followUpQuestion: `Donne le total pour: ${question}`,
          specificTables: tables,
        },
        {
          id: 'filter',
          label: 'Filtrer par periode',
          description: 'Ajouter un filtre de date pour affiner la recherche.',
          followUpQuestion: `${question} pour l'annee en cours`,
          specificTables: tables,
        },
      ],
    };
  }

  private detectDomainFallbackOptions(
    normalizedQuestion: string,
    tables: string[],
  ): ReadClarificationContext | null {
    const domainRules: Array<{
      terms: string[];
      result: ReadClarificationContext;
    }> = [
      // ── Finance / CA ──
      {
        terms: [
          'chiffre d affaire', 'chiffre d affaires', 'ca du cabinet',
          'revenu', 'revenus', 'recette', 'recettes', 'honoraire', 'honoraires',
          'montant facture', 'facturation', 'rentabilite', 'benefice', 'marge',
          'resultat financier', 'bilan financier', 'situation financiere',
        ],
        result: {
          reason: 'Le chiffre d\'affaires peut etre calcule de plusieurs manieres.',
          question: 'Quel indicateur financier souhaitez-vous ?',
          options: [
            {
              id: 'ca_facture',
              label: 'CA facture',
              description: 'Total HT des factures emises (chiffre d\'affaires facture).',
              followUpQuestion: 'Quel est le montant total HT de toutes les factures emises ?',
              specificTables: ['factures'],
            },
            {
              id: 'ca_encaisse',
              label: 'CA encaisse',
              description: 'Total des paiements effectivement recus.',
              followUpQuestion: 'Quel est le montant total des paiements recus ?',
              specificTables: ['paiements'],
            },
            {
              id: 'ca_periode',
              label: 'CA par periode',
              description: 'Chiffre d\'affaires facture ventile par mois ou par annee.',
              followUpQuestion: 'Donne le chiffre d\'affaires facture HT par mois pour l\'annee en cours',
              specificTables: ['factures'],
            },
            {
              id: 'ca_avocat',
              label: 'CA par avocat',
              description: 'Repartition du chiffre d\'affaires par collaborateur.',
              followUpQuestion: 'Quel est le chiffre d\'affaires facture HT par avocat ?',
              specificTables: ['factures', 'employee'],
            },
          ],
        },
      },
      // ── Factures ──
      {
        terms: [
          'facture impayee', 'factures impayees', 'facture en retard', 'factures en retard',
          'facture en attente', 'factures en attente', 'relance facture', 'impayes',
          'creance', 'creances', 'solde client', 'encours client',
        ],
        result: {
          reason: 'Les factures peuvent etre consultees selon plusieurs criteres.',
          question: 'Quel aspect des factures souhaitez-vous consulter ?',
          options: [
            {
              id: 'factures_impayees',
              label: 'Factures impayees',
              description: 'Liste des factures non reglees avec leur anciennete.',
              followUpQuestion: 'Liste les factures dont le statut est impaye avec le client, le montant et la date d\'emission',
              specificTables: ['factures', 'customer'],
            },
            {
              id: 'total_impayes',
              label: 'Total des impayes',
              description: 'Montant total des factures en attente de reglement.',
              followUpQuestion: 'Quel est le montant total des factures impayees ?',
              specificTables: ['factures'],
            },
            {
              id: 'factures_par_client',
              label: 'Par client',
              description: 'Repartition des factures par client.',
              followUpQuestion: 'Quel est le montant total des factures par client ?',
              specificTables: ['factures', 'customer'],
            },
          ],
        },
      },
      // ── Paiements ──
      {
        terms: [
          'paiement recu', 'paiements recus', 'reglement', 'reglements',
          'encaissement', 'encaissements', 'tresorerie',
        ],
        result: {
          reason: 'Les paiements peuvent etre consultes de differentes manieres.',
          question: 'Que souhaitez-vous savoir sur les paiements ?',
          options: [
            {
              id: 'paiements_recents',
              label: 'Paiements recents',
              description: 'Liste des derniers paiements recus.',
              followUpQuestion: 'Liste les 20 derniers paiements recus avec le client, le montant et la date',
              specificTables: ['paiements', 'customer'],
            },
            {
              id: 'total_paiements',
              label: 'Total encaisse',
              description: 'Montant total des paiements recus.',
              followUpQuestion: 'Quel est le montant total des paiements recus cette annee ?',
              specificTables: ['paiements'],
            },
            {
              id: 'paiements_mois',
              label: 'Par mois',
              description: 'Evolution des paiements par mois.',
              followUpQuestion: 'Donne le total des paiements recus par mois pour l\'annee en cours',
              specificTables: ['paiements'],
            },
          ],
        },
      },
      // ── Dossiers ──
      {
        terms: [
          'dossier en cours', 'dossiers en cours', 'dossiers ouverts', 'dossiers actifs',
          'etat des dossiers', 'situation des dossiers', 'bilan des dossiers',
          'dossiers du cabinet', 'mes dossiers', 'nos dossiers', 'tous les dossiers',
          'nombre de dossiers', 'combien de dossiers', 'statistiques dossiers',
        ],
        result: {
          reason: 'La consultation des dossiers peut prendre plusieurs angles.',
          question: 'Que souhaitez-vous savoir sur les dossiers ?',
          options: [
            {
              id: 'dossiers_count',
              label: 'Nombre de dossiers',
              description: 'Compter les dossiers en cours, clos et total.',
              followUpQuestion: 'Combien de dossiers sont en cours et combien sont clotures ?',
              specificTables: ['dossiers'],
            },
            {
              id: 'dossiers_list',
              label: 'Liste des dossiers',
              description: 'Afficher la liste des dossiers ouverts avec leurs details.',
              followUpQuestion: 'Liste les dossiers en cours avec leur reference, client et date d\'ouverture',
              specificTables: ['dossiers', 'customer'],
            },
            {
              id: 'dossiers_avocat',
              label: 'Dossiers par avocat',
              description: 'Repartition des dossiers par collaborateur.',
              followUpQuestion: 'Combien de dossiers en cours par avocat ?',
              specificTables: ['dossiers', 'employee'],
            },
          ],
        },
      },
      // ── Audiences ──
      {
        terms: [
          'audience a venir', 'audiences a venir', 'prochaine audience', 'prochaines audiences',
          'calendrier audience', 'planning audience', 'audience prevue', 'audiences prevues',
          'audience passee', 'audiences passees', 'audience du jour', 'audiences du jour',
          'audience cette semaine', 'audiences cette semaine', 'audience ce mois',
        ],
        result: {
          reason: 'Les audiences peuvent etre consultees de differentes manieres.',
          question: 'Que souhaitez-vous consulter sur les audiences ?',
          options: [
            {
              id: 'audiences_semaine',
              label: 'Cette semaine',
              description: 'Audiences programmees pour la semaine en cours.',
              followUpQuestion: 'Liste les audiences prevues cette semaine avec la date, le dossier et la juridiction',
              specificTables: ['audiences', 'dossiers'],
            },
            {
              id: 'audiences_mois',
              label: 'Ce mois',
              description: 'Toutes les audiences du mois en cours.',
              followUpQuestion: 'Liste les audiences prevues ce mois avec la date, le dossier et la juridiction',
              specificTables: ['audiences', 'dossiers'],
            },
            {
              id: 'audiences_avocat',
              label: 'Par avocat',
              description: 'Audiences a venir ventilees par collaborateur.',
              followUpQuestion: 'Combien d\'audiences a venir par avocat ?',
              specificTables: ['audiences', 'employee', 'dossiers'],
            },
          ],
        },
      },
      // ── Clients ──
      {
        terms: [
          'liste des clients', 'tous les clients', 'mes clients', 'nos clients',
          'clients actifs', 'clients du cabinet', 'nombre de clients',
          'combien de clients', 'nouveaux clients', 'client recent',
        ],
        result: {
          reason: 'Les clients peuvent etre consultes selon differents criteres.',
          question: 'Que souhaitez-vous savoir sur les clients ?',
          options: [
            {
              id: 'clients_list',
              label: 'Liste des clients',
              description: 'Afficher tous les clients avec leurs coordonnees.',
              followUpQuestion: 'Liste les clients avec leur nom, email et telephone',
              specificTables: ['customer'],
            },
            {
              id: 'clients_count',
              label: 'Nombre de clients',
              description: 'Compter le nombre total de clients.',
              followUpQuestion: 'Combien de clients sont enregistres dans le cabinet ?',
              specificTables: ['customer'],
            },
            {
              id: 'clients_dossiers',
              label: 'Clients avec dossiers',
              description: 'Clients ayant des dossiers en cours.',
              followUpQuestion: 'Liste les clients qui ont au moins un dossier en cours avec le nombre de dossiers',
              specificTables: ['customer', 'dossiers'],
            },
          ],
        },
      },
      // ── Collaborateurs / Avocats ──
      {
        terms: [
          'avocat', 'avocats', 'collaborateur', 'collaborateurs',
          'equipe', 'effectif', 'personnel', 'charge de travail',
          'performance avocat', 'activite avocat', 'productivite',
        ],
        result: {
          reason: 'L\'activite des collaborateurs peut etre consultee selon plusieurs axes.',
          question: 'Que souhaitez-vous savoir sur les collaborateurs ?',
          options: [
            {
              id: 'avocats_list',
              label: 'Liste des avocats',
              description: 'Afficher les collaborateurs du cabinet.',
              followUpQuestion: 'Liste les avocats et collaborateurs du cabinet avec leur poste',
              specificTables: ['employee'],
            },
            {
              id: 'charge_travail',
              label: 'Charge de travail',
              description: 'Nombre de dossiers en cours par avocat.',
              followUpQuestion: 'Combien de dossiers en cours sont assignes a chaque avocat ?',
              specificTables: ['dossiers', 'employee'],
            },
            {
              id: 'ca_par_avocat',
              label: 'CA par avocat',
              description: 'Chiffre d\'affaires genere par chaque collaborateur.',
              followUpQuestion: 'Quel est le chiffre d\'affaires facture par avocat ?',
              specificTables: ['factures', 'employee'],
            },
          ],
        },
      },
      // ── Documents ──
      {
        terms: [
          'document', 'documents', 'piece jointe', 'pieces jointes',
          'fichier', 'fichiers', 'contrat', 'contrats',
        ],
        result: {
          reason: 'Les documents peuvent etre consultes de differentes manieres.',
          question: 'Que souhaitez-vous consulter sur les documents ?',
          options: [
            {
              id: 'documents_recents',
              label: 'Documents recents',
              description: 'Derniers documents ajoutes au systeme.',
              followUpQuestion: 'Liste les 20 derniers documents ajoutes avec leur nom, type et le dossier associe',
              specificTables: ['document_customer', 'dossiers'],
            },
            {
              id: 'documents_par_dossier',
              label: 'Par dossier',
              description: 'Nombre de documents par dossier.',
              followUpQuestion: 'Combien de documents sont associes a chaque dossier ?',
              specificTables: ['document_customer', 'dossiers'],
            },
            {
              id: 'documents_par_type',
              label: 'Par type',
              description: 'Repartition des documents par type.',
              followUpQuestion: 'Combien de documents par type de document ?',
              specificTables: ['document_customer'],
            },
          ],
        },
      },
      // ── Diligences ──
      {
        terms: [
          'diligence', 'diligences', 'tache', 'taches',
          'a faire', 'en retard', 'echeance', 'echeances',
        ],
        result: {
          reason: 'Les diligences peuvent etre consultees selon leur statut ou leur echeance.',
          question: 'Que souhaitez-vous savoir sur les diligences ?',
          options: [
            {
              id: 'diligences_en_cours',
              label: 'En cours',
              description: 'Diligences actuellement en cours.',
              followUpQuestion: 'Liste les diligences en cours avec leur echeance, le dossier et l\'avocat responsable',
              specificTables: ['diligences', 'dossiers', 'employee'],
            },
            {
              id: 'diligences_retard',
              label: 'En retard',
              description: 'Diligences dont l\'echeance est depassee.',
              followUpQuestion: 'Liste les diligences dont la date d\'echeance est depassee',
              specificTables: ['diligences', 'dossiers'],
            },
            {
              id: 'diligences_avocat',
              label: 'Par avocat',
              description: 'Repartition des diligences par collaborateur.',
              followUpQuestion: 'Combien de diligences en cours par avocat ?',
              specificTables: ['diligences', 'employee'],
            },
          ],
        },
      },
      // ── Comptabilite ──
      {
        terms: [
          'comptabilite', 'ecriture comptable', 'ecritures comptables',
          'journal comptable', 'grand livre', 'balance', 'compte comptable',
          'plan comptable', 'exercice comptable',
        ],
        result: {
          reason: 'La comptabilite peut etre consultee selon differents axes.',
          question: 'Quel aspect de la comptabilite souhaitez-vous consulter ?',
          options: [
            {
              id: 'ecritures_recentes',
              label: 'Ecritures recentes',
              description: 'Dernieres ecritures comptables enregistrees.',
              followUpQuestion: 'Liste les 20 dernieres ecritures comptables avec le journal, la date, le libelle et le montant',
              specificTables: ['ecriture', 'journal'],
            },
            {
              id: 'solde_comptes',
              label: 'Solde des comptes',
              description: 'Solde actuel des principaux comptes comptables.',
              followUpQuestion: 'Donne le solde (total debit - total credit) de chaque compte comptable',
              specificTables: ['ecriture', 'compte'],
            },
            {
              id: 'ecritures_journal',
              label: 'Par journal',
              description: 'Ecritures ventilees par journal comptable.',
              followUpQuestion: 'Combien d\'ecritures et quel montant total par journal comptable ?',
              specificTables: ['ecriture', 'journal'],
            },
          ],
        },
      },
    ];

    for (const rule of domainRules) {
      if (rule.terms.some(term => this.containsNormalizedPhrase(normalizedQuestion, term))) {
        return rule.result;
      }
    }

    // Dernier recours : detecter via les tables trouvees
    return this.buildFallbackFromDetectedTables(normalizedQuestion, tables);
  }

  private buildFallbackFromDetectedTables(
    normalizedQuestion: string,
    tables: string[],
  ): ReadClarificationContext | null {
    if (!tables.length) return null;

    const tableLabels: Record<string, { label: string; listQuestion: string; countQuestion: string }> = {
      dossiers:          { label: 'dossiers',   listQuestion: 'Liste les dossiers avec leur reference, client et statut', countQuestion: 'Combien de dossiers au total ?' },
      customer:          { label: 'clients',    listQuestion: 'Liste les clients avec leur nom et coordonnees', countQuestion: 'Combien de clients au total ?' },
      employee:          { label: 'avocats',    listQuestion: 'Liste les avocats et collaborateurs du cabinet', countQuestion: 'Combien d\'avocats et collaborateurs ?' },
      audiences:         { label: 'audiences',  listQuestion: 'Liste les audiences a venir avec la date et le dossier', countQuestion: 'Combien d\'audiences programmees ?' },
      factures:          { label: 'factures',   listQuestion: 'Liste les factures avec le client, le montant et le statut', countQuestion: 'Quel est le montant total des factures ?' },
      paiements:         { label: 'paiements',  listQuestion: 'Liste les derniers paiements recus avec le client et le montant', countQuestion: 'Quel est le montant total des paiements recus ?' },
      diligences:        { label: 'diligences', listQuestion: 'Liste les diligences en cours avec leur echeance', countQuestion: 'Combien de diligences en cours ?' },
      document_customer: { label: 'documents',  listQuestion: 'Liste les derniers documents ajoutes', countQuestion: 'Combien de documents au total ?' },
    };

    const primaryTable = tables.find(t => tableLabels[t]) ?? tables[0];
    const info = tableLabels[primaryTable];
    if (!info) return null;

    return {
      reason: `La demande concerne les ${info.label} mais necessite plus de precision.`,
      question: `Que souhaitez-vous savoir sur les ${info.label} ?`,
      options: [
        {
          id: `${primaryTable}_list`,
          label: `Liste des ${info.label}`,
          description: `Afficher les ${info.label} avec leurs details.`,
          followUpQuestion: info.listQuestion,
          specificTables: [primaryTable],
        },
        {
          id: `${primaryTable}_count`,
          label: `Nombre / Total`,
          description: `Compter ou totaliser les ${info.label}.`,
          followUpQuestion: info.countQuestion,
          specificTables: [primaryTable],
        },
        {
          id: `${primaryTable}_period`,
          label: `Filtrer par periode`,
          description: `Les ${info.label} de cette annee ou de ce mois.`,
          followUpQuestion: `${info.listQuestion} pour l'annee en cours`,
          specificTables: [primaryTable],
        },
      ],
    };
  }

  /**
  * Génère une requête SQL de fallback intelligente
  */
  private generateFallbackQuery(question: string): string {
    const lower = question.toLowerCase();
    
    // Détecter le type d'ID/reference
    const refMatch = question.match(/[A-Z0-9-]{10,}/i);
    if (refMatch) {
      const ref = refMatch[0];
      // Essayer plusieurs colonnes possibles
      return `-- Recherche de la référence '${ref}'
  SELECT * FROM dossiers 
  WHERE reference = '${ref}' 
    OR numero_dossier = '${ref}' 
    OR id = '${ref}'
  LIMIT 10;`;
    }
    
    // Fallback générique
    return `-- Requête générée automatiquement
  SELECT NULL AS message 
  WHERE 1=0;
  -- Vérifiez que les données existent dans la base`;
  }

  /**
  * Demande explicitement du SQL (avec meilleur prompt)
  */
  private async askForSQLOnly(originalQuestion: string, schema?: string): Promise<string | null> {
    // ⚠️ Ne JAMAIS hardcoder un schéma (ex: "dossiers") : pour toute autre question
    // cela produit du SQL faux → 0 résultat. On s'appuie sur le schéma réel fourni.
    const schemaBlock = schema ? `Voici le schéma des tables disponibles :\n${schema}\n\n` : '';
    const readDomainRules = this.buildReadDomainRulesBlock();
    const reformatPrompt = `${schemaBlock}La question est : "${originalQuestion}"

  Génère UNE requête SQL SELECT (MySQL) qui répond à cette question, en te basant STRICTEMENT sur le schéma ci-dessus.

  RÈGLES:
  - UNIQUEMENT une requête SELECT, dans un bloc \`\`\`sql
  - Utilise EXACTEMENT les noms de tables et colonnes du schéma
  - Toutes les valeurs doivent être écrites en dur : aucun placeholder (?, :id, @param)
  - Pas d'explication, pas de texte
  - Ajoute LIMIT ${this.MAX_RESULTS}

  ${readDomainRules}

  Requête SQL:`;

    try {
      const response = await this.invokeModel('quality', [{
        role: "user",
        content: reformatPrompt
      }], 1000);
      const content = this.extractLlmText(response);
      const sql = this.extractSQLRelaxed(content);
      
      if (sql && sql.toLowerCase().includes('select')) {
        return sql;
      }
      return null;
    } catch (error) {
      this.logger.error(`Erreur reformatage: ${error.message}`);
      return null;
    }
  }

  private async regenerateSqlWithoutPlaceholders(
    currentQuery: string,
    previousMessages: Array<{ role: string; content: string }>,
    placeholders: string[],
  ): Promise<string> {
    const retryMessages = [
      ...previousMessages,
      {
        role: 'assistant',
        content: `La requete SQL generee contenait des placeholders non resolus (${placeholders.join(', ')}):\n\n\`\`\`sql\n${currentQuery}\n\`\`\``,
      },
      {
        role: 'user',
        content: `Regénère une requête SQL SELECT complète et exécutable.

Contraintes obligatoires :
- Remplace les placeholders par de vraies valeurs SQL issues de la question ou de l'historique.
- Pour une question de suivi comme "cette facture", réutilise les filtres métier déjà connus dans l'historique (client, statut, période, montant, etc.).
- Si un numéro exact manque, ne fais pas WHERE numero = ?. Utilise les filtres disponibles dans le contexte.
- Retourne uniquement un bloc \`\`\`sql avec la requête corrigée.`,
      },
    ];

    try {
      const response = await this.invokeModel('quality', retryMessages, 1200);
      const content = this.extractLlmText(response);
      const sql = this.extractSQL(content) || this.extractSQLRelaxed(content);
      return sql || currentQuery;
    } catch (error) {
      this.logger.error(`Erreur regeneration SQL sans placeholders: ${error.message}`);
      return currentQuery;
    }
  }



  /**
  * Extrait le contenu textuel d'un fichier uploadé
  */
  private async extractFileContent(file: Express.Multer.File): Promise<string> {
    return this.extractBufferContent(file.buffer, file.mimetype, file.originalname);
  }


  // ── Endpoint de confirmation ──────────────────────────────
  private async extractBufferContent(buffer: Buffer, mimetype = '', filename = ''): Promise<string> {
    const mime = (mimetype || '').toLowerCase();
    const ext = path.extname(filename || '').toLowerCase();

    if (
      mime.startsWith('text/') ||
      ['.txt', '.csv', '.json', '.html', '.htm', '.md', '.xml'].includes(ext) ||
      ['application/json', 'application/xml', 'application/xhtml+xml'].includes(mime)
    ) {
      return buffer.toString('utf-8');
    }

    if (mime === 'application/pdf' || ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const text = (data.text || '').trim();
      // PDF scanné (images sans couche texte) → pdf-parse ne renvoie (quasi) rien.
      // On le signale honnêtement au lieu de laisser croire à un document vide :
      // la réponse sera « ce document est un scan, OCR requis » plutôt qu'une
      // hallucination ou un repli silencieux sur les seules métadonnées.
      if (text.length < 20) {
        return `[Document PDF "${filename || 'sans nom'}" sans texte extractible : il s'agit probablement d'un document scanné (images). Sa lecture nécessite un OCR, non activé sur le serveur.]`;
      }
      return text;
    }

    if (
      mime.includes('spreadsheetml') ||
      mime.includes('ms-excel') ||
      ['.xls', '.xlsx'].includes(ext)
    ) {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        text += `\n--- Feuille: ${sheetName} ---\n`;
        text += XLSX.utils.sheet_to_csv(sheet);
      }
      return text;
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      return this.extractDocxText(buffer);
    }

    if (mime.startsWith('image/')) {
      return `[Image ${filename || 'sans nom'}: analyse OCR non disponible cote serveur. Ajoutez une description ou joignez un PDF/texte si le contenu doit etre lu.]`;
    }

    throw new Error(`Type de fichier non supporte: ${mimetype || ext || 'inconnu'}`);
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    try {
      const mammoth = require('mammoth');
      return mammoth.extractRawText({ buffer }).then((result: any) => result.value || '');
    } catch {
      throw new Error('Lecture DOCX indisponible: dependance mammoth absente');
    }
  }

  async confirmWrite(
    pendingIntent: WritePlan,
    user: AiUserContext | string
  ): Promise<AnalysisResponseDto> {
    const startTime = Date.now();
    const userId = this.getUserId(user);

    try {
      await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, pendingIntent);
      const writeResult = await this.genericWriteService.executePlan(pendingIntent, userId);
      return {
        success: true,
        question: 'Confirmation opération',
        analysis: this.formatPlanResults(writeResult),
        executionTimeMs: Date.now() - startTime,
        results: writeResult,
      };
    } catch (error) {
      if (error instanceof AmbiguityException) {
        this.logger.warn(
          `⚠️ Ambiguïté (confirmWrite): "${error.searchTerm}" dans "${error.entity}" ` +
          `(${error.candidates.length} candidats, opération ${error.operationIndex})`,
        );
        const message = this.buildAmbiguityMessage(error);
        return {
          success: true,
          question: 'Confirmation opération',
          analysis: message,
          pendingWritePlan: pendingIntent,
          requiresAmbiguityResolution: true,
          ambiguityContext: {
            entity: error.entity,
            fieldName: error.fieldName,
            searchTerm: error.searchTerm,
            candidates: error.candidates,
            operationIndex: error.operationIndex,
            parentEntity: error.parentEntity,
            allowOther: true,
            otherLabel: this.getFieldLabel(error.fieldName),
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
      throw error;
    }
  }
  
  /**
   * Construit le message d'ambiguïté affiché à l'utilisateur.
   * Contextualise en indiquant quelle entité est en cours de création
   * et pourquoi ce champ est nécessaire.
   *
   * Exemples :
   *   parentEntity=dossiers, fieldName=client, searchTerm="Jean Dupont"
   *   → "La création du **dossier** nécessite de préciser le **client**.
   *      Plusieurs correspondances ont été trouvées pour « Jean Dupont »."
   *
   *   parentEntity=dossiers, fieldName=lawyer, searchTerm="(non spécifié)"
   *   → "La création du **dossier** nécessite de préciser l'**avocat référent**.
   *      Veuillez choisir parmi les options disponibles."
   */
  private buildAmbiguityMessage(error: import('./write/ambiguity.exception').AmbiguityException): string {
    const parentLabel = error.parentEntity
      ? this.schemaMetadata.getTableLabel(error.parentEntity) || error.parentEntity
      : null;

    const fieldLabel = this.getFieldLabel(error.fieldName);
    const isUnspecified = error.searchTerm === '(non spécifié)' || error.searchTerm === '(non spécifiée)';
    const n = error.candidates.length;

    let intro = '';
    if (parentLabel) {
      const article = this.getArticle(parentLabel);
      const fieldArticle = this.getFieldArticle(error.fieldName);
      intro = `La ${error.parentEntity?.includes('s') ? 'création' : 'création'} ${article} **${parentLabel.toLowerCase()}** nécessite de préciser ${fieldArticle}**${fieldLabel}**.\n\n`;
    }

    if (isUnspecified) {
      return `🔍 ${intro}Veuillez choisir parmi les ${n} option(s) disponible(s) ci-dessous.`;
    }

    if (n === 0) {
      return `🔍 ${intro}Aucune correspondance trouvée pour **« ${error.searchTerm} »**. Veuillez vérifier l'orthographe ou fournir plus de détails.`;
    }

    return `🔍 ${intro}Plusieurs correspondances ont été trouvées pour **« ${error.searchTerm} »** (${n} résultat(s)). Veuillez sélectionner le bon :`;
  }

  /** Libellé lisible pour un alias de champ FK */
  private getFieldLabel(fieldName: string): string {
    // Le projet injecte ses labels via AI_DATABASE_PROJECT_CONFIG.fieldLabels
    const projectLabel = this.projectConfig?.fieldLabels?.[fieldName];
    if (projectLabel) return projectLabel;
    // Fallback générique : snake_case → mots séparés
    return fieldName.replace(/_/g, ' ');
  }

  /** Article défini adapté à la première lettre */
  private getArticle(label: string): string {
    const vowels = 'aeiouéèêëàâîï';
    return vowels.includes(label[0]?.toLowerCase()) ? 'de l\'' : 'du ';
  }

  /** Article indéfini adapté au champ (le/la/l') */
  private getFieldArticle(fieldName: string): string {
    const feminine = ['jurisdiction', 'procedure_type', 'procedure_subtype'];
    const vowelStart = ['employee', 'avocat'];
    const label = this.getFieldLabel(fieldName);
    if (vowelStart.some(v => label.startsWith(v))) return 'l\'';
    if (feminine.includes(fieldName)) return 'la ';
    return 'le ';
  }

  private formatPlanResults(results: WriteResult[]): string {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      // Compter les créations en cascade
      const allCascadeCreations = results.flatMap(r => r.cascadeCreations || []);
      
      let message = '';
      
      if (failCount === 0) {
        message = `✅ **Opération réussie !**\n\n${results.length} opération(s) exécutée(s) avec succès.`;
      } else {
        message = `⚠️ **Opération partiellement réussie**\n\n✅ ${successCount} succès\n❌ ${failCount} échecs`;
      }
      
      // Ajouter les créations en cascade si présentes
      if (allCascadeCreations.length > 0) {
        message += `\n\n📦 **Entités créées automatiquement :**`;
        for (const creation of allCascadeCreations) {
          const entityLabel = this.schemaMetadata.getTableLabel(creation.entityName) || creation.entityName;
          const entityId = (creation.entity as any)?.id || '?';
          message += `\n   • ${entityLabel} "${creation.searchTerm}" (ID: ${entityId})`;
        }
      }
      
      return message;
    }
  /**
   * MÉTHODE PRINCIPALE : Analyser une question avec gestion de session + fichier.
   *
   * Ordre des opérations :
   *  1. Extraire le contenu du fichier (si présent) → enrichir la question
   *  2. Détection d'intention sur la question enrichie (READ vs WRITE)
   *  3a. WRITE → exécution du plan, historique, gestion ambiguïté
   *  3b. READ  → SQL → résultats → analyse métier → historique
   */
  async analyzeQuestion(
    dto: AskQuestionDto,
    user: AiUserContext | string,
    file?: Express.Multer.File,
    aiRequestLogId?: number,
  ): Promise<AnalysisResponseDto> {
    return this.withAiMetrics('ask', aiRequestLogId, () =>
      this.analyzeQuestionInternal(dto, user, file),
    );
  }

  private async analyzeQuestionInternal(
    dto: AskQuestionDto,
    user: AiUserContext | string,
    file?: Express.Multer.File,
  ): Promise<AnalysisResponseDto> {
    const startTime = Date.now();
    const userId = this.getUserId(user);

    // ── 0. Reprise d'un plan WRITE en attente d'identifiant ───────────────────
    const resumed = this.tryConsumePendingEntityIdClarification(dto.conversationId, dto.question);
    if (resumed) {
      const conversationId = dto.conversationId!;
      await this.conversationManager.addUserMessage(
        conversationId,
        dto.question,
        parseReferencedContext(dto.context),
      );
      try {
        await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, resumed.plan);
        const results = await this.genericWriteService.executePlan(resumed.plan, userId);
        const analysis = this.formatPlanResults(results);
        await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
          results,
        });
        return {
          success: true, question: dto.question, analysis, results,
          conversationId, executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        if (error instanceof AmbiguityException) {
          const message = this.buildAmbiguityMessage(error);
          await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
          return {
            success: true, question: dto.question, analysis: message,
            pendingWritePlan: resumed.plan, requiresAmbiguityResolution: true,
            ambiguityContext: {
              entity: error.entity, fieldName: error.fieldName, searchTerm: error.searchTerm,
              candidates: error.candidates, operationIndex: error.operationIndex,
              parentEntity: error.parentEntity, allowOther: true,
              otherLabel: this.getFieldLabel(error.fieldName),
            },
            conversationId, executionTimeMs: Date.now() - startTime,
          };
        }
        if (error instanceof EntityIdRequiredException) {
          this.rememberPendingEntityIdClarification(
            conversationId, resumed.plan, error.operationIndex, error.entity, userId,
          );
          const message = `❓ Je n'ai toujours pas pu identifier précisément quel(le) ${error.entity.replace(/s$/, '')} modifier. Donnez-moi son identifiant exact (ex: "c'est l'audience 6").`;
          await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
          return {
            success: true, question: dto.question, analysis: message,
            conversationId, executionTimeMs: Date.now() - startTime,
          };
        }
        const errMsg = `❌ Erreur lors de l'exécution: ${error.message}`;
        await this.conversationManager.addAssistantMessage(conversationId, errMsg, undefined);
        return {
          success: false, question: dto.question, analysis: errMsg,
          conversationId, executionTimeMs: Date.now() - startTime, error: error.message,
        };
      }
    }

    // ── 1. Enrichissement par fichier (AVANT la détection d'intention) ────────
    let enrichedQuestion = dto.question;
    let fileInfo: any;

    // ── 1. Contexte enrichi : mentions, fichiers et documents système ────────
    const requestContext = await this.buildRequestContext(dto, file);
    enrichedQuestion = requestContext.enrichedQuestion;
    fileInfo = requestContext.fileInfo ?? fileInfo;
    const historyOverride = parseVisibleHistory(dto.historyOverride);
    const intentMode = this.normalizeIntentMode(dto.intentMode);

    if (dto.textGenerationOnly) {
      this.markMetric({ intent: 'TEXT' });
      this.logger.log(`✍️ Mode textGenerationOnly — détection d'intention désactivée`);
      try {
        const llmResponse = await this.invokeModel('fast', [
          { role: 'user', content: enrichedQuestion },
        ], 2000);
        const rawContent = typeof (llmResponse as any).content === 'string'
          ? (llmResponse as any).content
          : Array.isArray((llmResponse as any).content)
            ? (llmResponse as any).content.map((c: any) => c?.text ?? c).join('')
            : String((llmResponse as any).content ?? '');
        return {
          success:         true,
          question:        dto.question,
          analysis:        rawContent,
          executionTimeMs: Date.now() - startTime,
          conversationId:  dto.conversationId,
        } as any;
      } catch (err: any) {
        this.logger.error(`textGenerationOnly: ${err?.message}`);
        return {
          success:         false,
          question:        dto.question,
          analysis:        '',
          error:           err?.message ?? 'Erreur de génération de texte',
          executionTimeMs: Date.now() - startTime,
          conversationId:  dto.conversationId,
        } as any;
      }
    }

    // ── 2. Détection d'intention sur la question enrichie ────────────────────
    if (intentMode === 'auto' && this.intentDetectionService.classifyLocal(enrichedQuestion) === 'HELP') {
      this.markMetric({ intent: 'HELP' });
      return this.handleHelpIntent(
        enrichedQuestion,
        dto,
        userId,
        startTime,
        requestContext.referenced,
        fileInfo,
      );
    }

    if (intentMode === 'auto' && this.intentDetectionService.classifyLocal(enrichedQuestion) === 'ADVICE') {
      this.markMetric({ intent: 'ADVICE' });
      return this.handleAdviceIntent(
        enrichedQuestion,
        dto,
        userId,
        startTime,
        historyOverride,
        requestContext.referenced,
        fileInfo,
      );
    }

    const relevantTables = await this.detectRelevantTables(enrichedQuestion, dto.specificTables, requestContext.referenced);
    if (requestContext.documentContext.length && !relevantTables.includes('document_customer')) {
      relevantTables.push('document_customer');
    }
    const schema = await this.getCompleteSchema(relevantTables);
    const historyForIntent = historyOverride.length
      ? this.formatVisibleHistoryForIntent(historyOverride)
      : await this.getHistorySnippetForIntent(dto.conversationId);
    const forceWriteDespiteReadMode = this.shouldForceWriteDespiteReadMode(
      intentMode,
      dto.question,
      enrichedQuestion,
    );
    let intentResult: any;
    if (intentMode === 'read' && !forceWriteDespiteReadMode) {
      intentResult = { type: 'READ', requiresConfirmation: false };
    } else if (intentMode === 'chat') {
      intentResult = { type: 'CONVERSATIONAL', requiresConfirmation: false };
    } else {
      intentResult = await this.intentDetectionService.detectIntent(
        enrichedQuestion,
        this.aiModelRouter.getModel('fast', 64),
        schema,
        {
          forceWrite: intentMode === 'write' || forceWriteDespiteReadMode,
          history: historyForIntent,
          plannerLlm: this.aiModelRouter.getModel('quality', 1400),
          onLlmCall: this.trackExternalLlmCall,
          classifierModelName: this.aiModelRouter.getModelName('fast'),
          plannerModelName: this.aiModelRouter.getModelName('quality'),
        },
      );
    }
    this.logger.log(`🎯 Intention détectée: ${intentResult.type}`);
    this.markMetric({ intent: intentResult.type });

    if (intentResult.type === 'WRITE' && intentResult.writePlan) {
      intentResult.writePlan = this.enrichWritePlanWithReferencedEntities(
        intentResult.writePlan,
        requestContext.referenced,
      );
    }

    // ── 3a. BRANCHE CONVERSATIONNELLE ────────────────────────────────────────
    if (intentResult.type === 'HELP') {
      return this.handleHelpIntent(
        enrichedQuestion,
        dto,
        userId,
        startTime,
        requestContext.referenced,
        fileInfo,
      );
    }

    if (intentResult.type === 'ADVICE') {
      return this.handleAdviceIntent(
        enrichedQuestion,
        dto,
        userId,
        startTime,
        historyOverride,
        requestContext.referenced,
        fileInfo,
      );
    }

    if (intentResult.type === 'CONVERSATIONAL') {
      let conversationId = dto.conversationId;
      if (!conversationId) {
        const newConversation = await this.conversationManager.createConversation(
          userId,
          this.generateConversationTitle(dto.question),
        );
        conversationId = newConversation.id;
      }
      await this.conversationManager.addUserMessage(
        conversationId,
        dto.question,
        requestContext.referenced,
      );
      const analysis = intentResult.conversationalResponse
        ?? (await this.generateConversationalResponse(enrichedQuestion, historyOverride));
      await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined);
      return {
        success: true,
        question: dto.question,
        analysis,
        executionTimeMs: Date.now() - startTime,
        conversationId,
      };
    }

    // ── 3b. BRANCHE ÉCRITURE ──────────────────────────────────────────────────
    if (intentResult.type === 'WRITE' && intentResult.writePlan) {
      await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, intentResult.writePlan);
      return this.handleWriteIntent(
        intentResult.writePlan,
        intentResult.requiresConfirmation ?? false,
        enrichedQuestion,
        dto,
        userId,
        startTime,
        fileInfo,
        requestContext.referenced,
      );
    }

    // ── 3c. BRANCHE LECTURE ───────────────────────────────────────────────────
    // (schemaJSON/schema ne sont plus calculés ni renvoyés : non exploités par le front,
    //  et getCompleteSchemaJson déclenchait COUNT(*) + information_schema par table.)
    try {
      await this.aiPermissionService.assertCanReadTables(user as AiUserContext, relevantTables);
      let conversationId = dto.conversationId;

      if (!conversationId) {
        const title = this.generateConversationTitle(dto.question);
        const newConversation = await this.conversationManager.createConversation(userId, title);
        conversationId = newConversation.id;
      } else {
        const existingConv = await this.conversationManager.getConversation(conversationId);
        if (existingConv && (!existingConv.title || existingConv.title === 'Nouvelle conversation')) {
          await this.conversationManager.updateConversationTitle(
            conversationId,
            this.generateConversationTitle(dto.question),
          );
        }
      }

      const sqlQuery = await this.askQuestionWithSession(
        conversationId,
        enrichedQuestion,
        schema,
        relevantTables,
        dto.question,
        requestContext.referenced,
        historyOverride,
      );
      const validatedQuery = await this.validateAndFixQuery(sqlQuery, relevantTables, schema, enrichedQuestion);

      if (this.isSyntheticEmptyQuery(validatedQuery)) {
        const clarificationContext = await this.buildReadClarificationContext(
          dto.question,
          enrichedQuestion,
          schema,
          relevantTables,
          {
            historyForIntent,
            historyOverride,
            referenced: requestContext.referenced,
          },
          'La question n\'a pas permis de construire une requete SQL fiable.',
        );
        const analysis = `${clarificationContext.question}\n\nChoisissez une option pour orienter la recherche.`;
        await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
          sqlQuery: validatedQuery,
          results: [],
          rowCount: 0,
          requiresClarification: true,
          clarificationContext,
          ...(fileInfo && { fileInfo }),
        });
        return {
          success: true,
          question: dto.question,
          sqlQuery: validatedQuery,
          analysis,
          results: [],
          executionTimeMs: Date.now() - startTime,
          rowCount: 0,
          conversationId,
          requiresClarification: true,
          clarificationContext,
          ...(fileInfo && { fileInfo }),
        };
      }

      await this.aiPermissionService.assertCanReadSql(user as AiUserContext, validatedQuery);

      let results: { data: any[]; rowCount: number } | null = null;
      let analysis = '';

      if (validatedQuery && !dto.analyzeOnly) {
        results = await this.executeSafeQuery(validatedQuery);
        analysis = await this.generateBusinessAnalysis(
          dto.question, validatedQuery, results, dto.specificTables || [],
        );
        await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
          sqlQuery: validatedQuery,
          results: results.data,
          rowCount: results.rowCount,
          ...(fileInfo && { fileInfo }),
        });
      }

      return {
        success: true,
        question: dto.question,
        sqlQuery: validatedQuery,
        analysis,
        results: results?.data,
        executionTimeMs: Date.now() - startTime,
        rowCount: results?.rowCount || 0,
        conversationId,
        ...(fileInfo && { fileInfo }),
      };
    } catch (error) {
      this.logger.error(`❌ Erreur: ${error.message}`);
      return {
        success: false,
        question: dto.question,
        analysis: `Erreur: ${error.message}`,
        executionTimeMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BRANCHE WRITE : confirmation, ambiguïté, historique
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleHelpIntent(
    question: string,
    dto: AskQuestionDto,
    user: AiUserContext | string,
    startTime: number,
    references: ReferencedEntityContext[] = [],
    fileInfo?: any,
  ): Promise<AnalysisResponseDto> {
    const userId = this.getUserId(user);
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conv = await this.conversationManager.createConversation(
        userId,
        this.generateConversationTitle(dto.question),
      );
      conversationId = conv.id;
    }

    await this.conversationManager.addUserMessage(conversationId, dto.question, references);
    const analysis = this.generateHelpResponse(question);
    await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
      ...(fileInfo && { fileInfo }),
    });

    return {
      success: true,
      question: dto.question,
      analysis,
      conversationId,
      executionTimeMs: Date.now() - startTime,
      ...(fileInfo && { fileInfo }),
    };
  }

  private generateHelpResponse(question: string): string {
    const normalized = this.normalizeText(question);

    if (/\bdossiers?\b/.test(normalized)) {
      return `Pour créer un dossier :

1. Ouvrez le module Dossiers.
2. Cliquez sur Nouveau dossier.
3. Sélectionnez ou créez le client concerné.
4. Renseignez la procédure, l'objet du litige, la partie adverse et les dates importantes.
5. Ajoutez les documents si nécessaire.
6. Cliquez sur Enregistrer.

Si vous voulez, je peux aussi créer le dossier pour vous si vous me donnez les informations nécessaires.`;
    }

    if (/\bclients?\b/.test(normalized)) {
      return `Pour créer un client :

1. Ouvrez le module Clients.
2. Cliquez sur Nouveau client.
3. Renseignez les informations d'identité ou de société.
4. Ajoutez les coordonnées utiles : téléphone, email et adresse.
5. Vérifiez les champs obligatoires.
6. Cliquez sur Enregistrer.

Si vous voulez, je peux aussi créer le client pour vous si vous me donnez les informations nécessaires.`;
    }

    if (/\baudiences?\b/.test(normalized)) {
      return `Pour créer une audience :

1. Ouvrez le module Audiences ou la fiche du dossier concerné.
2. Cliquez sur Nouvelle audience.
3. Sélectionnez le dossier lié.
4. Renseignez la juridiction, la date, l'heure et l'objet de l'audience.
5. Ajoutez les observations ou pièces à préparer si nécessaire.
6. Cliquez sur Enregistrer.

Si vous voulez, je peux aussi préparer l'audience pour vous si vous me donnez le dossier, la date et les détails.`;
    }

    if (/\bpaiements?\b|\breglements?\b|\bencaissements?\b/.test(normalized)) {
      return `Pour enregistrer un paiement :

1. Ouvrez le module Paiements, Factures ou la fiche du client concerné.
2. Cliquez sur Nouveau paiement.
3. Sélectionnez le client ou la facture associée.
4. Renseignez le montant, la date, le mode de paiement et la référence.
5. Vérifiez l'imputation du paiement.
6. Cliquez sur Enregistrer.

Si vous voulez, je peux aussi enregistrer le paiement pour vous si vous me donnez les informations nécessaires.`;
    }

    return `Je peux vous guider dans l'utilisation de l'application.

Précisez le module ou l'action qui vous intéresse, par exemple : créer un dossier, créer un client, ajouter une audience ou enregistrer un paiement.`;
  }

  private async handleAdviceIntent(
    question: string,
    dto: AskQuestionDto,
    user: AiUserContext | string,
    startTime: number,
    historyOverride: VisibleHistoryMessage[] = [],
    references: ReferencedEntityContext[] = [],
    fileInfo?: any,
  ): Promise<AnalysisResponseDto> {
    const userId = this.getUserId(user);
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conv = await this.conversationManager.createConversation(
        userId,
        this.generateConversationTitle(dto.question),
      );
      conversationId = conv.id;
    }

    const history = await this.resolveAdviceHistory(conversationId, historyOverride);
    await this.conversationManager.addUserMessage(conversationId, dto.question, references);
    const analysis = await this.generateAdviceResponse(question, history);
    await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
      intent: 'ADVICE',
      ...(fileInfo && { fileInfo }),
    });

    return {
      success: true,
      question: dto.question,
      analysis,
      conversationId,
      executionTimeMs: Date.now() - startTime,
      ...(fileInfo && { fileInfo }),
    };
  }

  private async handleAdviceIntentStream(
    question: string,
    dto: AskQuestionDto,
    user: AiUserContext | string,
    startTime: number,
    sendEvent: (event: string, data: any) => void,
    historyOverride: VisibleHistoryMessage[] = [],
    references: ReferencedEntityContext[] = [],
    fileInfo?: any,
  ): Promise<void> {
    const userId = this.getUserId(user);
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conv = await this.conversationManager.createConversation(
        userId,
        this.generateConversationTitle(dto.question),
      );
      conversationId = conv.id;
    }

    const history = await this.resolveAdviceHistory(conversationId, historyOverride);
    await this.conversationManager.addUserMessage(conversationId, dto.question, references);
    const analysis = await this.generateAdviceResponseStream(question, history, sendEvent);
    await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
      intent: 'ADVICE',
      ...(fileInfo && { fileInfo }),
    });
    sendEvent('result', {
      success: true,
      question: dto.question,
      analysis,
      conversationId,
      executionTimeMs: Date.now() - startTime,
      ...(fileInfo && { fileInfo }),
    });
  }

  private async resolveAdviceHistory(
    conversationId: string | undefined,
    historyOverride: VisibleHistoryMessage[] = [],
  ): Promise<VisibleHistoryMessage[]> {
    if (historyOverride.length) return historyOverride.slice(-8);
    if (!conversationId) return [];

    const recent = await this.conversationManager.getRecentHistoryForPrompt(conversationId, {
      maxMessages: 8,
      maxTokens: 6000,
    });
    return recent
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));
  }

  private buildAdviceMessages(question: string, history: VisibleHistoryMessage[] = []) {
    const systemPrompt = `Tu es un conseiller métier pour un cabinet d'avocats utilisant KabySoft.

Ta tâche est de donner des recommandations utiles hors base de données quand l'utilisateur demande un conseil, une suggestion, quoi ajouter, quoi améliorer ou les prochaines étapes.

Règles :
- Ne génère jamais de SQL.
- Ne lance aucune action et ne prétends pas modifier la base.
- Base-toi d'abord sur l'historique fourni ; si le contexte est partiel, dis clairement tes hypothèses.
- Donne des suggestions concrètes, priorisées et adaptées au cabinet.
- Si la demande suit une liste de résultats, propose ce qu'il serait pertinent d'ajouter, compléter, contrôler ou automatiser.
- Réponds en français, de façon directe, avec 4 à 8 points maximum.`;

    return [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(message => ({ role: message.role, content: message.content })),
      { role: 'user', content: question },
    ] as any;
  }

  private async generateAdviceResponse(
    question: string,
    history: VisibleHistoryMessage[] = [],
  ): Promise<string> {
    const response = await this.invokeModel('fast', this.buildAdviceMessages(question, history), this.MAX_TOKENS);
    return this.extractLlmText(response);
  }

  private async generateAdviceResponseStream(
    question: string,
    history: VisibleHistoryMessage[] = [],
    sendEvent: (event: string, data: any) => void,
  ): Promise<string> {
    const messages = this.buildAdviceMessages(question, history);
    let fullText = '';

    try {
      const stream = await this.streamModel('streaming', messages, this.MAX_TOKENS);
      for await (const chunk of stream) {
        const text = this.extractChunkText(chunk);
        if (text) {
          fullText += text;
          this.recordOutput(text, true);
          sendEvent('token', { text });
        }
      }
    } catch (error) {
      this.logger.warn(`Advice stream echoue, fallback invoke: ${(error as Error).message}`);
      const response = await this.invokeModel('fast', messages, this.MAX_TOKENS);
      fullText = this.extractLlmText(response);
      sendEvent('token', { text: fullText });
    }

    return fullText;
  }

  private async handleWriteIntent(
    plan: WritePlan,
    requiresConfirmation: boolean,
    enrichedQuestion: string,
    dto: AskQuestionDto,
    user: AiUserContext | string,
    startTime: number,
    fileInfo?: any,
    references: ReferencedEntityContext[] = [],
  ): Promise<AnalysisResponseDto> {

    // ── Gérer / créer la conversation (historique write) ───────────────────
    const userId = this.getUserId(user);
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const title = this.generateConversationTitle(dto.question);
      const conv = await this.conversationManager.createConversation(userId, title);
      conversationId = conv.id;
    }
    // Enregistrer la question dans l'historique
    await this.conversationManager.addUserMessage(conversationId, dto.question, references);

    // ── Confirmation requise ────────────────────────────────────────────────
    if (requiresConfirmation) {
      const display = `⚠️ **Confirmation requise**\n\n${this.formatPlanForDisplay(plan)}`;
      await this.conversationManager.addAssistantMessage(conversationId, display, undefined, {
        pendingWritePlan: plan,
        requiresConfirmation: true,
        ...(fileInfo && { fileInfo }),
      });
      return {
        success: true,
        question: dto.question,
        analysis: display,
        pendingWritePlan: plan,
        requiresConfirmation: true,
        conversationId,
        executionTimeMs: Date.now() - startTime,
        ...(fileInfo && { fileInfo }),
      };
    }

    // ── Exécution directe ──────────────────────────────────────────────────
    try {
      const results = await this.genericWriteService.executePlan(plan, userId);
      const analysis = this.formatPlanResults(results);
      await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
        results,
        ...(fileInfo && { fileInfo }),
      });

      return {
        success: true,
        question: dto.question,
        analysis,
        results,
        conversationId,
        executionTimeMs: Date.now() - startTime,
        ...(fileInfo && { fileInfo }),
      };
    } catch (error) {
      // ── Ambiguïté détectée : retourner les candidats au front ───────────
      if (error instanceof AmbiguityException) {
        this.logger.warn(
          `⚠️ Ambiguïté: "${error.searchTerm}" dans "${error.entity}" ` +
          `(${error.candidates.length} candidats, opération ${error.operationIndex})`,
        );

        const message = this.buildAmbiguityMessage(error);

        await this.conversationManager.addAssistantMessage(conversationId, message, undefined);

        return {
          success: true,          // ← pas une erreur : état normal en attente de choix
          question: dto.question,
          analysis: message,
          pendingWritePlan: plan,
          requiresAmbiguityResolution: true,
          ambiguityContext: {
            entity: error.entity,
            fieldName: error.fieldName,
            searchTerm: error.searchTerm,
            candidates: error.candidates,
            operationIndex: error.operationIndex,
            parentEntity: error.parentEntity,
            allowOther: true,
            otherLabel: this.getFieldLabel(error.fieldName),
          },
          conversationId,
          executionTimeMs: Date.now() - startTime,
          ...(fileInfo && { fileInfo }),
        };
      }

      // ── ID manquant : on garde le plan en mémoire pour la conversation ──
      // au lieu de le perdre, et on demande une précision à l'utilisateur.
      if (error instanceof EntityIdRequiredException) {
        this.rememberPendingEntityIdClarification(
          conversationId, plan, error.operationIndex, error.entity, userId,
        );
        const message = `❓ Je n'ai pas pu identifier précisément quel(le) ${error.entity.replace(/s$/, '')} modifier. Donnez-moi son identifiant ou un critère unique (ex: "c'est l'audience 6") et je continuerai.`;
        await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
        return {
          success: true,
          question: dto.question,
          analysis: message,
          conversationId,
          executionTimeMs: Date.now() - startTime,
          ...(fileInfo && { fileInfo }),
        };
      }

      this.logger.error(`❌ Erreur écriture: ${error.message}`);
      const errMsg = `❌ Erreur lors de l'exécution: ${error.message}`;
      await this.conversationManager.addAssistantMessage(conversationId, errMsg, undefined);

      return {
        success: false,
        question: dto.question,
        analysis: errMsg,
        conversationId,
        executionTimeMs: Date.now() - startTime,
        error: error.message,
        ...(fileInfo && { fileInfo }),
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REPRISE APRÈS AMBIGUÏTÉ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Reprend l'exécution d'un WritePlan après que l'utilisateur a choisi
   * l'entité souhaitée parmi les candidats ambigus.
   *
   * Stratégie :
   *  - Injecte l'ID choisi dans le champ FK de l'opération concernée
   *  - Ajoute resolveConfig.mode = 'best_effort' pour éviter une re-détection
   *  - Relance executePlan depuis le début (transaction = tout ou rien)
   *
   * @param pendingPlan   Le WritePlan original (retourné lors de l'ambiguïté)
   * @param operationIndex  Index de l'opération qui avait échoué
   * @param fieldName       Alias FK à remplacer (ex: "client")
   * @param resolvedId      ID de l'entité choisie par l'utilisateur
   * @param userId          Utilisateur courant
   * @param conversationId  Pour mise à jour de l'historique
   */
  async resumeAfterAmbiguity(
    pendingPlan: WritePlan,
    operationIndex: number,
    fieldName: string,
    resolvedId: string | number | undefined,
    user: AiUserContext | string,
    conversationId?: string,
    customValue?: string,
    entity?: string,
  ): Promise<AnalysisResponseDto> {
    const startTime = Date.now();
    const userId = this.getUserId(user);

    // Deep clone du plan pour ne pas muter l'original
    const patchedPlan: WritePlan = JSON.parse(JSON.stringify(pendingPlan));
    const op = patchedPlan.operations[operationIndex];

    if (!op) {
      return {
        success: false,
        question: 'Reprise après ambiguïté',
        analysis: `❌ Opération ${operationIndex} introuvable dans le plan`,
        executionTimeMs: Date.now() - startTime,
        error: 'operationIndex invalide',
      };
    }

    if (!op.entityId) {
      const fallbackEntityId = Number(
        (op.fields as any)?.id
        ?? (op.fields as any)?.entityId
        ?? (op.fields as any)?.[`${op.entity}_id`],
      );
      if (Number.isInteger(fallbackEntityId) && fallbackEntityId > 0) {
        op.entityId = fallbackEntityId;
        delete (op.fields as any).id;
        delete (op.fields as any).entityId;
        delete (op.fields as any)[`${op.entity}_id`];
      }
    }

    // ── Option « Autre » : customValue fourni ───────────────────────────────
    if (customValue && !resolvedId) {
      return this.handleOtherChoice(
        patchedPlan, op, operationIndex, fieldName,
        customValue, entity ?? '', user, userId, conversationId, startTime,
      );
    }

    // ── Option classique : resolvedId fourni ────────────────────────────────
    op.fields[fieldName] = resolvedId;
    op.resolveConfig = { mode: 'best_effort', ambiguityGap: 0 };

    this.logger.log(
      `🔄 Reprise: opération ${operationIndex} "${op.entity}" — ` +
      `"${fieldName}" → ID ${resolvedId}`,
    );

    await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, patchedPlan);
    return this.executePatchedPlan(patchedPlan, userId, conversationId, startTime);
  }

  // ── « Autre » : créer l'entité puis reprendre le plan ──────────────────────

  private async handleOtherChoice(
    patchedPlan: WritePlan,
    op: import('./dto/analysis-response.dto').WriteOperation,
    operationIndex: number,
    fieldName: string,
    customValue: string,
    entityTable: string,
    user: AiUserContext | string,
    userId: string,
    conversationId: string | undefined,
    startTime: number,
  ): Promise<AnalysisResponseDto> {
    this.logger.log(
      `🆕 Option "Autre" : création dans "${entityTable}" avec "${customValue}" ` +
      `pour le champ "${fieldName}" (opération ${operationIndex})`,
    );

    // 1. Trouver le handler enregistré pour cette table
    await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, patchedPlan);
    const handler = this.writeHandlerRegistry.getHandler(entityTable);
    if (!handler) {
      // Pas de handler → on injecte le texte brut et on laisse la résolution retenter
      this.logger.warn(`⚠️ Aucun handler pour "${entityTable}" — injection du texte brut`);
      op.fields[fieldName] = customValue;
      op.resolveConfig = { mode: 'best_effort', ambiguityGap: 0 };
      return this.executePatchedPlan(patchedPlan, userId, conversationId, startTime);
    }

    // 2. Construire les champs minimaux pour la création
    await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, {
      transaction: false,
      operations: [{
        operation: 'INSERT',
        entity: entityTable,
        fields: {},
        humanReadable: `Creation de ${entityTable}`,
      }],
      humanReadable: `Creation de ${entityTable}`,
      confidence: 1,
    });
    const createFields = await this.buildMinimalFields(entityTable, customValue, fieldName, op.fields);

    try {
      // 3. Exécuter l'INSERT via le handler
      const writeResult = await handler.execute(
        {
          operation: 'INSERT',
          entity: entityTable,
          fields: createFields,
          confidence: 1,
          humanReadable: `Création de ${this.getFieldLabel(fieldName)} « ${customValue} » (choix « Autre »)`,
        },
        userId,
      );

      if (!writeResult.success || !writeResult.entityId) {
        return {
          success: false,
          question: 'Reprise après ambiguïté — création',
          analysis: `❌ Création échouée : ${writeResult.message}`,
          conversationId,
          executionTimeMs: Date.now() - startTime,
          error: writeResult.message,
        };
      }

      this.logger.log(`✅ Entité créée dans "${entityTable}" → ID ${writeResult.entityId}`);

      // 4. Injecter l'ID dans le plan et reprendre
      op.fields[fieldName] = writeResult.entityId;
      op.resolveConfig = { mode: 'best_effort', ambiguityGap: 0 };

      return this.executePatchedPlan(patchedPlan, userId, conversationId, startTime,
        `✅ **${this.getFieldLabel(fieldName)}** créé(e) : « ${customValue} » (ID: ${writeResult.entityId})\n\n`,
      );
    } catch (error) {
      // Si le handler lève une ambiguïté (ex: FK manquante dans l'entité enfant)
      if (error instanceof AmbiguityException) {
        const message = this.buildAmbiguityMessage(error);
        return {
          success: true,
          question: 'Reprise après ambiguïté — création',
          analysis: `⚠️ La création nécessite des précisions supplémentaires :\n\n${message}`,
          pendingWritePlan: patchedPlan,
          requiresAmbiguityResolution: true,
          ambiguityContext: {
            entity: error.entity,
            fieldName: error.fieldName,
            searchTerm: error.searchTerm,
            candidates: error.candidates,
            operationIndex: error.operationIndex,
            parentEntity: error.parentEntity,
            allowOther: true,
            otherLabel: this.getFieldLabel(error.fieldName),
          },
          conversationId,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Erreur de validation → message clair
      const msg = (error as Error).message;
      this.logger.error(`❌ Création "${customValue}" dans "${entityTable}" échouée: ${msg}`);
      return {
        success: false,
        question: 'Reprise après ambiguïté — création',
        analysis: `❌ Impossible de créer « ${customValue} » dans ${entityTable} : ${msg}`,
        conversationId,
        executionTimeMs: Date.now() - startTime,
        error: msg,
      };
    }
  }

  /**
   * Construit les champs minimaux pour créer une entité depuis l'option "Autre".
   * Détecte le champ "nom" principal de la table et injecte le customValue.
   * Injecte aussi les champs contextuels pertinents (ex: is_subtype, parent_id).
   *
   * Pour procedure_subtype : résout le procedure_type_id depuis les champs de l'opération
   * (ID direct ou résolution texte) afin d'injecter parent_id automatiquement.
   */
  private async buildMinimalFields(
    entityTable: string,
    customValue: string,
    fieldName: string,
    operationFields: Record<string, any>,
  ): Promise<Record<string, any>> {
    const fields: Record<string, any> = {};

    // Champ "nom" de l'entité cible
    const nameField = this.guessNameField(entityTable);
    fields[nameField] = customValue;

    // ── Champs contextuels spécifiques ──────────────────────────────────────

    if (fieldName === 'procedure_subtype') {
      fields['is_subtype'] = true;
      fields['hierarchy_level'] = 2;

      // Résoudre le parent_id :
      // 1. L'ID est directement dans les champs (cas idéal)
      // 2. L'ID est dans procedure_type_id (parfois injecté dans le plan)
      // 3. Le texte procedure_type est disponible → résolution par nom en BDD
      let parentId: number | undefined =
        operationFields.procedure_type_id
        ?? operationFields.procedure_subtype_id   // fallback rare
        ?? undefined;

      if (!parentId && operationFields.procedure_type && typeof operationFields.procedure_type === 'string') {
        try {
          // Chercher le type principal par correspondance de nom (is_subtype=false)
          const activeTenantId = hasActiveTenant() ? getCurrentTenantId() : null;
          const tenantClause = activeTenantId ? ' AND tenant_id = ?' : '';
          const tenantParams = activeTenantId ? [`%${operationFields.procedure_type}%`, activeTenantId] : [`%${operationFields.procedure_type}%`];
          const rows: any[] = await this.dataSource.query(
            `SELECT id FROM procedure_types WHERE name LIKE ? AND is_subtype = 0${tenantClause} LIMIT 1`,
            tenantParams,
          );
          if (rows.length > 0) {
            parentId = rows[0].id;
            this.logger.log(`🔗 parent_id résolu depuis procedure_type="${operationFields.procedure_type}" → ID ${parentId}`);
          }
        } catch (e) {
          this.logger.warn(`⚠️ Impossible de résoudre procedure_type pour parent_id: ${(e as Error).message}`);
        }
      }

      if (parentId) {
        fields['parent_id'] = Number(parentId);
      } else {
        this.logger.warn(`⚠️ parent_id introuvable pour créer le sous-type "${customValue}"`);
      }
    }

    if (fieldName === 'procedure_type') {
      fields['is_subtype'] = false;
      fields['hierarchy_level'] = 1;
    }

    return fields;
  }

  /**
   * Devine le champ "nom" principal d'une entité.
   * Cherche dans l'ordre : name, label, title, object, first_name.
   */
  private guessNameField(entityTable: string): string {
    const meta = this.dataSource.entityMetadatas.find(m => m.tableName === entityTable);
    if (!meta) return 'name';

    const priorityFields = ['name', 'label', 'title', 'object', 'first_name'];
    for (const pf of priorityFields) {
      if (meta.columns.some(c => c.databaseName === pf || c.propertyName === pf)) {
        return pf;
      }
    }
    return 'name';
  }

  // ── Exécution du plan patché (factorisé) ──────────────────────────────────

  private async executePatchedPlan(
    patchedPlan: WritePlan,
    userId: string,
    conversationId: string | undefined,
    startTime: number,
    prefixMessage?: string,
  ): Promise<AnalysisResponseDto> {
    try {
      const results = await this.genericWriteService.executePlan(patchedPlan, userId);
      const analysis = (prefixMessage ?? '') + this.formatPlanResults(results);

      if (conversationId) {
        await this.conversationManager.addAssistantMessage(
          conversationId,
          `✅ Reprise réussie après sélection.\n\n${analysis}`,
          undefined,
        );
      }

      return {
        success: true,
        question: 'Reprise après ambiguïté',
        analysis,
        results,
        conversationId,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof AmbiguityException) {
        const message = this.buildAmbiguityMessage(error);

        if (conversationId) {
          await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
        }

        return {
          success: true,
          question: 'Reprise après ambiguïté',
          analysis: message,
          pendingWritePlan: patchedPlan,
          requiresAmbiguityResolution: true,
          ambiguityContext: {
            entity: error.entity,
            fieldName: error.fieldName,
            searchTerm: error.searchTerm,
            candidates: error.candidates,
            operationIndex: error.operationIndex,
            parentEntity: error.parentEntity,
            allowOther: true,
            otherLabel: this.getFieldLabel(error.fieldName),
          },
          conversationId,
          executionTimeMs: Date.now() - startTime,
        };
      }

      return {
        success: false,
        question: 'Reprise après ambiguïté',
        analysis: `❌ ${(error as Error).message}`,
        conversationId,
        executionTimeMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STREAMING SSE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Version streaming de analyzeQuestion.
   * Émet des événements SSE via `sendEvent` à chaque étape clé.
   *
   * Événements émis :
   *   status          → progression textuelle (ex: "Analyse en cours...")
   *   intent          → { type: 'READ'|'WRITE', plan? }
   *   confirmation    → { plan } (write avec confirmation requise)
   *   ambiguity       → { entity, fieldName, searchTerm, candidates, operationIndex }
   *   result          → AnalysisResponseDto complet
   *   error           → { message }
   */
  /** Pause entre événements SSE pour que le front ait le temps de les afficher */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Exécute une fonction asynchrone avec tentatives de réessai.
   * @param fn Fonction asynchrone à exécuter
   * @param retries Nombre de tentatives (défaut: 2)
   * @param delayMs Délai entre chaque tentative en ms (défaut: 1000)
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    retries = 2,
    delayMs = 1000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`⚠️ [Retry] Tentative ${attempt}/${retries} échouée: ${errMsg} — nouvelle tentative dans ${delayMs}ms...`);
        if (attempt === retries) throw err;
        await this.sleep(delayMs);
      }
    }
    throw new Error('withRetry: sortie de boucle inattendue');
  }

  /**
   * Met en forme les entités référencées via `@` en un bloc texte injecté dans
   * le prompt. Expose les IDs exacts afin que le LLM cible les bonnes lignes
   * plutôt que de deviner (« ce client », « ce dossier »…).
   */
  private formatReferencedContext(items: ReferencedEntityContext[]): string {
    const cleanText = (value: unknown): string => String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const lines = items.map(it => {
      const id = it.data?.id;
      const idPart = id !== undefined && id !== null ? ` (id=${id})` : '';
      const extra: string[] = [];
      const d = it.data ?? {};
      for (const key of ['reference', 'numero', 'email', 'phone', 'telephone']) {
        if (d[key]) extra.push(`${key}=${cleanText(d[key])}`);
      }
      const extraPart = extra.length ? ` [${extra.join(', ')}]` : '';
      return `- ${cleanText(it.type)}: "${cleanText(it.label)}"${idPart}${extraPart}`;
    });
    return `\n\n--- ENTITÉS RÉFÉRENCÉES PAR L'UTILISATEUR (via @) ---
Utilise EXACTEMENT ces entités (et leurs IDs) quand la question y fait référence :
${lines.join('\n')}
---`;
  }

  private normalizeIntentMode(mode?: string): IntentMode {
    if (mode === 'read' || mode === 'write' || mode === 'chat') return mode;
    return 'auto';
  }

  /**
   * Petit extrait de l'historique récent, formaté en texte, pour aider la
   * détection WRITE à résoudre les références implicites ("la", "le",
   * "cette audience"...) vers l'ID réel mentionné dans un tour précédent
   * (ex: une liste d'audiences affichée juste avant avec leurs IDs).
   *
   * Volontairement court (3 messages / ~1500 chars) : on ne veut pas alourdir
   * le prompt de détection d'intention, juste lui donner le minimum de
   * contexte pour éviter un "ID requis" alors que l'utilisateur a déjà
   * désigné l'élément concerné dans la conversation.
   */
  /** Mémorise un plan WRITE en attente d'identifiant pour cette conversation. */
  private rememberPendingEntityIdClarification(
    conversationId: string, plan: WritePlan, operationIndex: number, entity: string, userId: string,
  ): void {
    this.pendingEntityIdClarifications.set(conversationId, {
      plan, operationIndex, entity, userId, createdAt: Date.now(),
    });
  }

  /**
   * Si la conversation a un plan WRITE en attente d'identifiant et que le
   * message courant contient un nombre exploitable (ex: "c'est l'audience 6",
   * "le numéro 6", ou juste "6"), patche le plan avec cet ID et le retourne
   * prêt à être réexécuté. Sinon (pas de plan en attente, ou pas de nombre
   * trouvé dans la réponse), retourne null et laisse le flux normal traiter
   * la question comme une nouvelle demande.
   */
  private tryConsumePendingEntityIdClarification(
    conversationId: string | undefined, question: string,
  ): { plan: WritePlan; userId: string } | null {
    if (!conversationId) return null;
    const pending = this.pendingEntityIdClarifications.get(conversationId);
    if (!pending) return null;

    // Expiration : on ne veut pas réinterpréter un nombre dans un message
    // sans rapport posé bien plus tard dans la même conversation.
    if (Date.now() - pending.createdAt > this.PENDING_CLARIFICATION_TTL) {
      this.pendingEntityIdClarifications.delete(conversationId);
      return null;
    }

    const match = question.match(/\d+/);
    if (!match) {
      // La réponse ne contient pas d'identifiant exploitable : on abandonne
      // la clarification plutôt que de deviner, et on traite la question
      // normalement (elle peut être sans rapport avec le plan en attente).
      this.pendingEntityIdClarifications.delete(conversationId);
      return null;
    }

    const entityId = Number(match[0]);
    this.pendingEntityIdClarifications.delete(conversationId);

    const patchedPlan: WritePlan = JSON.parse(JSON.stringify(pending.plan));
    const op = patchedPlan.operations[pending.operationIndex];
    if (!op) return null;
    op.entityId = entityId;

    this.logger.log(
      `🔄 Reprise après clarification d'ID: opération ${pending.operationIndex} "${op.entity}" → entityId=${entityId}`,
    );

    return { plan: patchedPlan, userId: pending.userId };
  }

  private async getHistorySnippetForIntent(conversationId?: string): Promise<string> {
    if (!conversationId) return '';
    try {
      const history = await this.conversationManager.getRecentHistoryForPrompt(conversationId, {
        maxMessages: 3,
        maxTokens: 1200,
      });
      if (!history.length) return '';
      return history
        .map(m => `${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}: ${m.content}`.substring(0, 600))
        .join('\n---\n')
        .substring(0, 1500);
    } catch (err) {
      this.logger.warn(`getHistorySnippetForIntent: ${(err as Error).message}`);
      return '';
    }
  }

  private formatVisibleHistoryForIntent(history: VisibleHistoryMessage[]): string {
    return history
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}: ${m.content}`.substring(0, 600))
      .join('\n---\n')
      .substring(0, 1800);
  }

  private enrichWritePlanWithReferencedEntities(
    plan: WritePlan | undefined,
    referenced: ReferencedEntityContext[],
  ): WritePlan | undefined {
    if (!plan || !referenced.length) return plan;

    const normalizeEntityToken = (value: string): string => {
      const normalized = value.toLowerCase().trim();
      if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
      if (normalized.endsWith('es')) return normalized.slice(0, -2);
      if (normalized.endsWith('s')) return normalized.slice(0, -1);
      return normalized;
    };

    const matchEntityId = (entityName: string): number | undefined => {
      const normalizedEntity = normalizeEntityToken(entityName);
      const candidates = referenced.filter(item => {
        const type = normalizeEntityToken(String(item.type || ''));
        return type === normalizedEntity;
      });

      if (candidates.length !== 1) return undefined;
      const rawId = candidates[0].data?.id;
      const id = Number(rawId);
      return Number.isInteger(id) && id > 0 ? id : undefined;
    };

    for (const operation of plan.operations) {
      if (operation.operation !== 'UPDATE' && operation.operation !== 'DELETE') continue;
      if (operation.entityId) continue;

      const explicitFieldId = Number(
        (operation.fields as any)?.id
        ?? (operation.fields as any)?.entityId
        ?? (operation.fields as any)?.[`${operation.entity}_id`],
      );
      if (Number.isInteger(explicitFieldId) && explicitFieldId > 0) {
        operation.entityId = explicitFieldId;
        delete (operation.fields as any).id;
        delete (operation.fields as any).entityId;
        delete (operation.fields as any)[`${operation.entity}_id`];
        continue;
      }

      const referencedId = matchEntityId(operation.entity);
      if (referencedId) {
        operation.entityId = referencedId;
      }
    }

    return plan;
  }

  private parseDocumentIds(dto: AskQuestionDto, referenced: ReferencedEntityContext[]): number[] {
    const ids = new Set<number>();
    const add = (value: unknown) => {
      const num = Number(value);
      if (Number.isInteger(num) && num > 0) ids.add(num);
    };

    const raw = dto.documentIds as unknown;
    if (Array.isArray(raw)) {
      raw.forEach(add);
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) parsed.forEach(add);
        else add(parsed);
      } catch {
        raw.split(',').forEach(part => add(part.trim()));
      }
    }

    for (const item of referenced) {
      if (['document', 'documents', 'document_customer'].includes(item.type?.toLowerCase())) {
        add(item.data?.id);
      }
    }

    return Array.from(ids).slice(0, this.MAX_SYSTEM_DOCUMENTS);
  }

  /**
   * Résout des documents par leur NOM lorsqu'aucune référence explicite (@ ou
   * documentIds) n'est fournie, mais que la question évoque un document.
   *
   * Stratégie sûre : on ne matche QUE si le nom stocké (sans extension, ≥ 3 car.)
   * apparaît littéralement dans la question — limite les faux positifs.
   * Gardé derrière un filtre de mots-clés pour ne pas scanner document_customer à
   * chaque question (le LIKE sur fonction ne peut pas utiliser d'index ; un index
   * FULLTEXT sur `name` serait l'optimisation suivante si le volume l'exige).
   */
  private async resolveDocumentIdsByName(question: string): Promise<number[]> {
    const docIntent = /\b(document|pi[eè]ces?|contrat|fichier|acte|jugement|conclusions?|attestation|pdf)\b/i;
    if (!question || !docIntent.test(question)) return [];

    const tenantId = hasActiveTenant() ? getCurrentTenantId() : null;
    const params: any[] = [question];
    let tenantClause = '';
    if (tenantId && tenantId !== 1) {
      tenantClause = ' AND tenant_id = ?';
      params.push(tenantId);
    }

    try {
      const rows: Array<{ id: number }> = await this.dataSource.query(
        `SELECT id FROM document_customer
         WHERE deleted_at IS NULL
           AND CHAR_LENGTH(SUBSTRING_INDEX(name, '.', 1)) >= 3
           AND ? LIKE CONCAT('%', SUBSTRING_INDEX(name, '.', 1), '%')${tenantClause}
         ORDER BY CHAR_LENGTH(name) DESC, uploaded_at DESC
         LIMIT ${this.MAX_SYSTEM_DOCUMENTS}`,
        params,
      );
      const ids = rows.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
      if (ids.length) {
        this.logger.log(`📄 Document(s) résolu(s) par nom depuis la question: [${ids.join(', ')}]`);
      }
      return ids;
    } catch (e) {
      this.logger.warn(`Résolution document par nom échouée: ${(e as Error).message}`);
      return [];
    }
  }

  private normalizeStringArray(value?: string[] | string): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value !== 'string' || !value.trim()) return undefined;

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item)).filter(Boolean);
      }
    } catch {
      // Fallback CSV ci-dessous.
    }

    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  private buildDocumentContextBlock(items: DocumentContextItem[], question: string): string {
    if (!items.length) return '';

    const blocks = items.map((item, index) => {
      const title = item.id ? `Document systeme #${item.id}` : `Fichier joint #${index + 1}`;
      const meta = [
        `nom="${item.name}"`,
        item.type ? `type=${item.type}` : null,
        item.size ? `taille=${item.size}` : null,
        `source=${item.source}`,
      ].filter(Boolean).join(', ');

      const content = item.error
        ? `[Erreur de lecture: ${item.error}]`
        : this.selectRelevantDocumentText(question, item.content, 8000);

      return `### ${title} (${meta})
${content}
${item.truncated ? '\n[Contenu tronque pour rester dans la limite de contexte]' : ''}`;
    });

    return `\n\n--- DOCUMENTS A ANALYSER ---
Les extraits suivants proviennent des documents explicitement joints ou mentionnes par l'utilisateur.
Base tes reponses sur ces extraits quand la question parle de "ce document", "la piece", "le contrat", etc.

${blocks.join('\n\n')}
--- FIN DOCUMENTS ---`;
  }

  private selectRelevantDocumentText(question: string, content: string, maxChars: number): string {
    const normalized = (content || '').replace(/\u0000/g, '').trim();
    if (normalized.length <= maxChars) return normalized;

    const keywords = this.extractSearchKeywords(question);
    const chunks = this.chunkText(normalized, 1400);
    const scored = chunks.map((chunk, index) => ({
      chunk,
      index,
      score: keywords.reduce((sum, keyword) => {
        const matches = chunk.toLowerCase().split(keyword).length - 1;
        return sum + matches;
      }, 0),
    }));

    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    const selected = (scored.some(item => item.score > 0) ? scored : scored.slice(0, 4))
      .slice(0, 4)
      .sort((a, b) => a.index - b.index);

    let output = '';
    for (const item of selected) {
      const next = `${output ? '\n\n[...]\n\n' : ''}${item.chunk.trim()}`;
      if (next.length > maxChars) break;
      output = next;
    }

    return output || normalized.substring(0, maxChars);
  }

  private extractSearchKeywords(question: string): string[] {
    const stopWords = new Set([
      'avec', 'dans', 'pour', 'quoi', 'quel', 'quelle', 'quels', 'quelles',
      'sont', 'avoir', 'etre', 'est', 'les', 'des', 'une', 'sur', 'aux',
      'this', 'that', 'the', 'and',
    ]);
    return this.normalizeText(question)
      .split(/[^a-z0-9]+/i)
      .map(word => word.trim())
      .filter(word => word.length >= 4 && !stopWords.has(word))
      .slice(0, 12);
  }

  private normalizeText(text: string): string {
    return String(text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae');
  }

  private chunkText(text: string, size: number): string[] {
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = '';

    for (const paragraph of paragraphs) {
      if ((current + '\n\n' + paragraph).length <= size) {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      } else {
        if (current) chunks.push(current);
        if (paragraph.length <= size) {
          current = paragraph;
        } else {
          for (let i = 0; i < paragraph.length; i += size) {
            chunks.push(paragraph.slice(i, i + size));
          }
          current = '';
        }
      }
    }

    if (current) chunks.push(current);
    return chunks.length ? chunks : [text.substring(0, size)];
  }

  private truncateContextText(text: string, maxChars: number): { content: string; truncated: boolean } {
    const normalized = (text || '').replace(/\u0000/g, '').trim();
    if (normalized.length <= maxChars) {
      return { content: normalized, truncated: false };
    }
    return {
      content: normalized.substring(0, maxChars),
      truncated: true,
    };
  }

  private async buildRequestContext(
    dto: AskQuestionDto,
    file?: Express.Multer.File,
  ): Promise<RequestContext> {
    const referenced = parseReferencedContext(dto.context);
    const documentContext: DocumentContextItem[] = [];
    let enrichedQuestion = dto.question;
    let fileInfo: any;

    if (file) {
      try {
        const content = await this.extractFileContent(file);
        const truncated = this.truncateContextText(content, this.MAX_FILE_CONTEXT_CHARS);
        documentContext.push({
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          source: 'upload',
          content: truncated.content,
          truncated: truncated.truncated,
        });
        fileInfo = { name: file.originalname, size: file.size, type: file.mimetype };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        documentContext.push({
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          source: 'upload',
          content: '',
          truncated: false,
          error: message,
        });
        fileInfo = { name: file.originalname, size: file.size, type: file.mimetype, error: message };
      }
    }

    const documentIds = this.parseDocumentIds(dto, referenced);
    // Repli : aucune référence explicite (@ ou documentIds) mais la question évoque
    // un document par son nom (« résume le document Contrat_Dupont ») → résolution auto.
    if (documentIds.length === 0) {
      documentIds.push(...(await this.resolveDocumentIdsByName(dto.question)));
    }
    for (const documentId of documentIds) {
      documentContext.push(await this.loadSystemDocumentContext(documentId));
    }

    if (referenced.length) {
      enrichedQuestion += this.formatReferencedContext(referenced);
    }

    enrichedQuestion += this.buildDocumentContextBlock(documentContext, dto.question);

    return { enrichedQuestion, fileInfo, documentContext, referenced };
  }

  private async loadSystemDocumentContext(documentId: number): Promise<DocumentContextItem> {
    const base: DocumentContextItem = {
      id: documentId,
      name: `Document #${documentId}`,
      source: 'system',
      content: '',
      truncated: false,
    };

    try {
      const document = await this.documentRepository.findOne({
        where: { id: documentId },
        relations: ['customer', 'document_type', 'dossier', 'category'],
      });

      if (!document) {
        return { ...base, error: 'Document introuvable' };
      }

      const name = document.name || document.metadata?.original_filename || `Document #${documentId}`;
      const type = document.file_mimetype || this.inferMimeFromName(name);
      const buffer = await this.readDocumentBuffer(document);
      const extracted = await this.extractBufferContent(buffer, type, name);
      const truncated = this.truncateContextText(extracted, this.MAX_DOCUMENT_CONTEXT_CHARS);

      const header = [
        `Nom: ${name}`,
        document.document_type?.name ? `Type metier: ${document.document_type.name}` : null,
        document.category?.name ? `Categorie: ${document.category.name}` : null,
        document.dossier?.dossier_number ? `Dossier: ${document.dossier.dossier_number}` : null,
        document.customer?.full_name ? `Client: ${document.customer.full_name}` : null,
        document.description ? `Description: ${document.description}` : null,
      ].filter(Boolean).join('\n');

      return {
        id: document.id,
        name,
        type,
        size: document.file_size,
        source: 'system',
        content: `${header}\n\n${truncated.content}`.trim(),
        truncated: truncated.truncated,
      };
    } catch (error) {
      return {
        ...base,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readDocumentBuffer(document: DocumentCustomer): Promise<Buffer> {
    if (document.file_path) {
      const filePath = document.file_path.replace(/\//g, path.sep).replace(/\\/g, path.sep);
      const candidates = [
        filePath,
        path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath),
      ];
      const existing = candidates.find(candidate => fs.existsSync(candidate));
      if (existing) {
        return fs.promises.readFile(existing);
      }
    }

    if (document.file_url?.startsWith('http')) {
      const response = await fetch(document.file_url);
      if (!response.ok) {
        throw new Error(`Document distant inaccessible (${response.status})`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    throw new Error('Fichier physique introuvable');
  }

  private inferMimeFromName(name: string): string {
    const ext = path.extname(name || '').toLowerCase();
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    return map[ext] || 'application/octet-stream';
  }

  async analyzeQuestionStream(
    dto: AskQuestionDto,
    user: AiUserContext | string,
    file: Express.Multer.File | undefined,
    sendEvent: (event: string, data: any) => void,
    aiRequestLogId?: number,
  ): Promise<void> {
    return this.withAiMetrics('ask_stream', aiRequestLogId, () =>
      this.analyzeQuestionStreamInternal(dto, user, file, sendEvent),
    );
  }

  private async analyzeQuestionStreamInternal(
    dto: AskQuestionDto,
    user: AiUserContext | string,
    file: Express.Multer.File | undefined,
    sendEvent: (event: string, data: any) => void,
  ): Promise<void> {
    const startTime = Date.now();
    const userId = this.getUserId(user);
    const tLog = (label: string) => this.logger.log(`🕐 [STREAM] ${label} @ +${Date.now() - startTime}ms`);

    /** sendEvent avec délai : chaque status est visible ~200ms avant le suivant */
    const emit = async (event: string, data: any, delayMs = 200) => {
      sendEvent(event, data);
      if (event === 'status') await this.sleep(delayMs);
    };

    try {
      tLog('service entré');

      // ── 0. Reprise d'un plan WRITE en attente d'identifiant ─────────────────
      // (ex: "marque-la comme reportée" → entityId manquant → on a demandé
      // "quelle audience ?" → l'utilisateur répond "c'est l'audience 6")
      const resumed = this.tryConsumePendingEntityIdClarification(dto.conversationId, dto.question);
      if (resumed) {
        sendEvent('intent', { type: 'WRITE', plan: resumed.plan });
        await emit('status', { message: `⚙️ Exécution de ${resumed.plan.operations.length} opération(s)...` });
        const conversationId = dto.conversationId!;
        await this.conversationManager.addUserMessage(
          conversationId,
          dto.question,
          parseReferencedContext(dto.context),
        );
        try {
          await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, resumed.plan);
          const results = await this.genericWriteService.executePlan(resumed.plan, userId);
          const analysis = this.formatPlanResults(results);
          await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined);
          sendEvent('result', {
            success: true, question: dto.question, analysis, results,
            conversationId, executionTimeMs: Date.now() - startTime,
          });
        } catch (error: any) {
          if (error instanceof AmbiguityException) {
            sendEvent('ambiguity', {
              entity: error.entity, fieldName: error.fieldName, searchTerm: error.searchTerm,
              candidates: error.candidates, operationIndex: error.operationIndex,
              parentEntity: error.parentEntity, message: this.buildAmbiguityMessage(error),
              pendingWritePlan: resumed.plan, conversationId, allowOther: true,
              otherLabel: this.getFieldLabel(error.fieldName),
            });
          } else if (error instanceof EntityIdRequiredException) {
            this.rememberPendingEntityIdClarification(
              conversationId, resumed.plan, error.operationIndex, error.entity, userId,
            );
            const message = `❓ Je n'ai toujours pas pu identifier précisément quel(le) ${error.entity.replace(/s$/, '')} modifier. Donnez-moi son identifiant exact (ex: "c'est l'audience 6").`;
            await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
            sendEvent('result', {
              success: true, question: dto.question, analysis: message,
              conversationId, executionTimeMs: Date.now() - startTime,
            });
          } else {
            sendEvent('error', { message: error.message });
          }
        }
        return;
      }

      // ── 1. Contexte enrichi : mentions, fichiers et documents système ──────
      let enrichedQuestion = dto.question;
      let fileInfo: any;

      // ── 2. Détection d'intention ────────────────────────────────────────────
      tLog('avant status 🔍');
      await emit('status', { message: '🔍 Analyse de la demande...' });
      tLog('après status sleep(200ms) — DeepSeek lightClassify démarre');
      const requestContext = await this.buildRequestContext(dto, file);
      enrichedQuestion = requestContext.enrichedQuestion;
      fileInfo = requestContext.fileInfo ?? fileInfo;
      const historyOverride = parseVisibleHistory(dto.historyOverride);
      const intentMode = this.normalizeIntentMode(dto.intentMode);
      if (dto.textGenerationOnly) {
        this.markMetric({ intent: 'TEXT' });
        const fullText = await this.generateTextOnlyResponseStream(enrichedQuestion, sendEvent);
        sendEvent('result', {
          success: true,
          question: dto.question,
          analysis: fullText,
          executionTimeMs: Date.now() - startTime,
          ...(fileInfo && { fileInfo }),
        });
        return;
      }
      if (intentMode === 'auto' && this.intentDetectionService.classifyLocal(enrichedQuestion) === 'HELP') {
        this.markMetric({ intent: 'HELP' });
        sendEvent('intent', { type: 'HELP' });
        const result = await this.handleHelpIntent(
          enrichedQuestion,
          dto,
          userId,
          startTime,
          requestContext.referenced,
          fileInfo,
        );
        sendEvent('token', { text: result.analysis });
        sendEvent('result', result);
        return;
      }
      if (intentMode === 'auto' && this.intentDetectionService.classifyLocal(enrichedQuestion) === 'ADVICE') {
        this.markMetric({ intent: 'ADVICE' });
        sendEvent('intent', { type: 'ADVICE' });
        await this.handleAdviceIntentStream(
          enrichedQuestion,
          dto,
          userId,
          startTime,
          sendEvent,
          historyOverride,
          requestContext.referenced,
          fileInfo,
        );
        return;
      }

      if (requestContext.documentContext.length) {
        await emit('status', {
          message: `📄 ${requestContext.documentContext.length} document(s) pris en compte`,
        }, 80);
      }
      if (requestContext.referenced.length) {
        await emit('status', {
          message: `🔗 ${requestContext.referenced.length} référence(s) prise(s) en compte`,
        }, 80);
      }

      const relevantTables = await this.detectRelevantTables(enrichedQuestion, dto.specificTables, requestContext.referenced);
      if (requestContext.documentContext.length && !relevantTables.includes('document_customer')) {
        relevantTables.push('document_customer');
      }
      const schema = await this.getCompleteSchema(relevantTables);
      tLog('schema prêt — appel detectIntent');
      const historyForIntent = historyOverride.length
        ? this.formatVisibleHistoryForIntent(historyOverride)
        : await this.getHistorySnippetForIntent(dto.conversationId);

      // ── 2bis. Analyse directe de documents (bypass SQL) ─────────────────────
      // Si l'utilisateur a joint OU mentionné (@) un document dont le CONTENU a
      // pu être extrait, et que l'intention n'est pas une écriture explicite, on
      // analyse directement le TEXTE du document (résumé, extraction de clauses…)
      // au lieu de générer du SQL — qui ne verrait que les métadonnées.
      const hasReadableDocument = requestContext.documentContext.some(
        d => !d.error && !!d.content && d.content.trim().length > 40,
      );
      if (hasReadableDocument && intentMode !== 'write') {
        await this.aiPermissionService.assertCanReadTables(user as AiUserContext, relevantTables);
        sendEvent('intent', { type: 'READ' });
        await emit('status', { message: '📄 Lecture et analyse du contenu du document...' }, 80);

        let conversationId = dto.conversationId;
        if (!conversationId) {
          const conv = await this.conversationManager.createConversation(
            userId, this.generateConversationTitle(dto.question),
          );
          conversationId = conv.id;
        }
        await this.conversationManager.addUserMessage(
          conversationId,
          dto.question,
          requestContext.referenced,
        );

        const analysis = await this.analyzeDocumentsStream(
          dto.question, requestContext.documentContext, sendEvent,
        );
        await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined);

        sendEvent('result', {
          success: true, question: dto.question, analysis,
          conversationId, executionTimeMs: Date.now() - startTime,
          ...(fileInfo && { fileInfo }),
        });
        return;
      }

      let intentResult: any;
      const forceWriteDespiteReadMode = this.shouldForceWriteDespiteReadMode(
        intentMode,
        dto.question,
        enrichedQuestion,
      );
      if (intentMode === 'read' && !forceWriteDespiteReadMode) {
        intentResult = { type: 'READ', requiresConfirmation: false };
      } else if (intentMode === 'chat') {
        intentResult = { type: 'CONVERSATIONAL', requiresConfirmation: false };
      } else {
        intentResult = await this.intentDetectionService.detectIntent(
          enrichedQuestion, this.aiModelRouter.getModel('fast', 64), schema,
          {
            forceWrite: intentMode === 'write' || forceWriteDespiteReadMode,
            history: historyForIntent,
            plannerLlm: this.aiModelRouter.getModel('quality', 1400),
            onLlmCall: this.trackExternalLlmCall,
            classifierModelName: this.aiModelRouter.getModelName('fast'),
            plannerModelName: this.aiModelRouter.getModelName('quality'),
          },
        );
      }
      tLog(`detectIntent retourné → ${intentResult.type}`);
      this.markMetric({ intent: intentResult.type });
      if (intentResult.type === 'WRITE' && intentResult.writePlan) {
        intentResult.writePlan = this.enrichWritePlanWithReferencedEntities(
          intentResult.writePlan,
          requestContext.referenced,
        );
      }
      sendEvent('intent', { type: intentResult.type, plan: intentResult.writePlan });
      await this.sleep(150);

      if (intentResult.type === 'HELP') {
        const result = await this.handleHelpIntent(
          enrichedQuestion,
          dto,
          userId,
          startTime,
          requestContext.referenced,
          fileInfo,
        );
        sendEvent('token', { text: result.analysis });
        sendEvent('result', result);
        return;
      }

      // ── 3a. CONVERSATIONAL ───────────────────────────────────────────────────
      if (intentResult.type === 'ADVICE') {
        await this.handleAdviceIntentStream(
          enrichedQuestion,
          dto,
          userId,
          startTime,
          sendEvent,
          historyOverride,
          requestContext.referenced,
          fileInfo,
        );
        return;
      }

      if (intentResult.type === 'CONVERSATIONAL') {
        let conversationId = dto.conversationId;
        if (!conversationId) {
          const conv = await this.conversationManager.createConversation(
            userId, this.generateConversationTitle(dto.question),
          );
          conversationId = conv.id;
        }
        await this.conversationManager.addUserMessage(
          conversationId,
          dto.question,
          requestContext.referenced,
        );
        // Stream directement depuis le LLM (llm.stream), token par token en temps réel.
        // On n'utilise plus conversationalResponse pré-générée (qui bloquait 30s).
        const fullText = await this.generateConversationalResponseStream(
          enrichedQuestion,
          sendEvent,
          historyOverride,
        );
        await this.conversationManager.addAssistantMessage(conversationId, fullText, undefined);
        sendEvent('result', {
          success: true,
          question: dto.question,
          analysis: fullText,
          executionTimeMs: Date.now() - startTime,
          conversationId,
        });
        return;
      }

      // ── 3b. WRITE ────────────────────────────────────────────────────────────
      if (intentResult.type === 'WRITE' && intentResult.writePlan) {
        const plan = intentResult.writePlan;
        await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, plan);

        let conversationId = dto.conversationId;
        if (!conversationId) {
          const conv = await this.conversationManager.createConversation(
            userId, this.generateConversationTitle(dto.question),
          );
          conversationId = conv.id;
        }
        await this.conversationManager.addUserMessage(
          conversationId,
          dto.question,
          requestContext.referenced,
        );

        if (intentResult.requiresConfirmation) {
          sendEvent('confirmation', { plan, conversationId });
          const display = `⚠️ **Confirmation requise**\n\n${this.formatPlanForDisplay(plan)}`;
          await this.conversationManager.addAssistantMessage(conversationId, display, undefined, {
            pendingWritePlan: plan,
            requiresConfirmation: true,
          });
          sendEvent('result', {
            success: true, question: dto.question, analysis: display,
            pendingWritePlan: plan, requiresConfirmation: true,
            conversationId, executionTimeMs: Date.now() - startTime,
          });
          return;
        }

        await emit('status', { message: `⚙️ Exécution de ${plan.operations.length} opération(s)...` });

        await this.executeWritePlanStream(
          plan, userId, conversationId, dto, fileInfo, startTime, sendEvent,
        );
        return;
      }

      // ── 3c. READ ─────────────────────────────────────────────────────────────
      await emit('status', { message: '🗄️ Génération de la requête SQL...' });

      let conversationId = dto.conversationId;
      if (!conversationId) {
        const conv = await this.conversationManager.createConversation(
          userId, this.generateConversationTitle(dto.question),
        );
        conversationId = conv.id;
      }

      await this.aiPermissionService.assertCanReadTables(user as AiUserContext, relevantTables);
      const sqlQuery = await this.askQuestionWithSession(
        conversationId,
        enrichedQuestion,
        schema,
        relevantTables,
        dto.question,
        requestContext.referenced,
        historyOverride,
      );
      await emit('status', { message: '✅ Requête générée, exécution en cours...' });

      // validateAndFixQuery valide déjà via EXPLAIN et s'auto-corrige (jusqu'à 2 passes
      // LLM en interne) — inutile de le ré-emballer dans withRetry, qui multipliait les
      // appels LLM (jusqu'à 4) et la latence. On exécute la requête validée directement.
      const validatedQuery = await this.validateAndFixQuery(sqlQuery, relevantTables, schema, enrichedQuestion);
      if (this.isSyntheticEmptyQuery(validatedQuery)) {
        const clarificationContext = await this.buildReadClarificationContext(
          dto.question,
          enrichedQuestion,
          schema,
          relevantTables,
          {
            historyForIntent,
            historyOverride,
            referenced: requestContext.referenced,
          },
          'La question n\'a pas permis de construire une requete SQL fiable.',
        );
        const analysis = `${clarificationContext.question}\n\nChoisissez une option pour orienter la recherche.`;
        await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
          sqlQuery: validatedQuery,
          results: [],
          rowCount: 0,
          requiresClarification: true,
          clarificationContext,
          ...(fileInfo && { fileInfo }),
        });
        sendEvent('result', {
          success: true,
          question: dto.question,
          sqlQuery: validatedQuery,
          analysis,
          results: [],
          rowCount: 0,
          conversationId,
          executionTimeMs: Date.now() - startTime,
          requiresClarification: true,
          clarificationContext,
          ...(fileInfo && { fileInfo }),
        });
        return;
      }
      await this.aiPermissionService.assertCanReadSql(user as AiUserContext, validatedQuery);

      // 🛟 Filet de sécurité : si la requête générée n'est PAS un SELECT, c'est que
      // la demande était en réalité une écriture mal classée en lecture. Plutôt que
      // de renvoyer "Seules les requêtes SELECT sont autorisées", on re-route vers
      // la voie WRITE (forceWrite) et on exécute le plan correspondant.
      if (!this.isSelectQuery(validatedQuery)) {
        this.logger.warn(
          `🛟 Requête non-SELECT générée en voie READ → re-routage WRITE: ${validatedQuery.substring(0, 120)}`,
        );
        const rerouted = await this.intentDetectionService.detectIntent(
          enrichedQuestion, this.aiModelRouter.getModel('fast', 64), schema,
          {
            forceWrite: true,
            history: historyForIntent,
            plannerLlm: this.aiModelRouter.getModel('quality', 1400),
            onLlmCall: this.trackExternalLlmCall,
            classifierModelName: this.aiModelRouter.getModelName('fast'),
            plannerModelName: this.aiModelRouter.getModelName('quality'),
          },
        );
        if (rerouted.type === 'WRITE' && rerouted.writePlan) {
          const reroutedPlan = this.enrichWritePlanWithReferencedEntities(
            rerouted.writePlan, requestContext.referenced,
          ) ?? rerouted.writePlan;
          await this.aiPermissionService.assertCanWritePlan(user as AiUserContext, reroutedPlan);
          sendEvent('intent', { type: 'WRITE', plan: reroutedPlan });
          await this.conversationManager.addUserMessage(
            conversationId,
            dto.question,
            requestContext.referenced,
          );
          await emit('status', { message: `⚙️ Exécution de ${reroutedPlan.operations.length} opération(s)...` });
          await this.executeWritePlanStream(
            reroutedPlan, userId, conversationId, dto, fileInfo, startTime, sendEvent,
          );
          return;
        }
        // Re-routage impossible → message clair plutôt que l'erreur SQL brute
        const msg = `Je n'ai pas pu interpréter cette demande comme une écriture en base. Reformulez en précisant l'action (ex: "passe une écriture au journal des ventes : débit 411000 1190, crédit 701000 1190").`;
        await this.conversationManager.addAssistantMessage(conversationId, msg, undefined);
        sendEvent('result', {
          success: true, question: dto.question, analysis: msg,
          conversationId, executionTimeMs: Date.now() - startTime,
        });
        return;
      }

      const results = await this.executeSafeQuery(validatedQuery);

      await emit('status', { message: '📊 Analyse des résultats...' });

      // Streaming token-by-token de l'analyse métier
      const analysis = await this.generateBusinessAnalysisStream(
        dto.question, validatedQuery, results, dto.specificTables || [],
        sendEvent,
      );
      await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined, {
        sqlQuery: validatedQuery,
        results: results.data,
        rowCount: results.rowCount,
        ...(fileInfo && { fileInfo }),
      });

      // ⚡ On NE renvoie PLUS schemaJSON/schema : le front ne les exploite pas et leur
      // génération (COUNT(*) + information_schema par table) + leur transfert alourdissaient
      // CHAQUE réponse. Suppression = gain direct de latence et de bande passante.
      sendEvent('result', {
        success: true, question: dto.question,
        sqlQuery: validatedQuery, analysis,
        results: results.data, rowCount: results.rowCount,
        conversationId, executionTimeMs: Date.now() - startTime,
        ...(fileInfo && { fileInfo }),
      });

    } catch (error) {
      this.logger.error(`❌ Erreur streaming: ${error.message}`);
      this.markMetric({ status: 'error' });
      sendEvent('error', { message: error.message });
    }
  }

  /**
   * Analyse DIRECTE du contenu d'un/des document(s) — sans passer par le SQL.
   *
   * Utilisé quand l'utilisateur joint ou mentionne (@) un document dont le texte
   * a été extrait : la question porte sur le CONTENU du fichier (résumé,
   * extraction de clauses, dates, montants…), pas sur les métadonnées en base.
   * On envoie le texte extrait directement au LLM et on streame la réponse.
   */
  private async analyzeDocumentsStream(
    question: string,
    documentContext: DocumentContextItem[],
    sendEvent: (event: string, data: any) => void,
  ): Promise<string> {
    const prompt = this.buildDocumentAnalysisPrompt(question, documentContext);

    let fullText = '';
    let tokenCount = 0;
    this.logger.log(`🌊 [DOC STREAM] Analyse directe — prompt ${prompt.length} chars`);

    try {
      const stream = await this.streamModel('streaming', prompt, this.MAX_TOKENS);
      for await (const chunk of stream) {
        const text = this.extractChunkText(chunk);
        if (text) {
          fullText += text;
          tokenCount++;
          this.recordOutput(text, true);
          sendEvent('token', { text });
        }
      }
      this.logger.log(`✅ [DOC STREAM] Terminé — ${tokenCount} tokens, ${fullText.length} chars`);
    } catch (err) {
      this.logger.warn(`⚠️ [DOC STREAM] llm.stream() échoué → fallback invoke: ${(err as Error).message}`);
      const response = await this.invokeModel('streaming', prompt, this.MAX_TOKENS);
      fullText = this.extractLlmText(response);
      sendEvent('token', { text: fullText });
    }

    return fullText;
  }

  /**
   * Construit le prompt d'analyse directe à partir du texte extrait des documents.
   * Le modèle doit s'appuyer UNIQUEMENT sur le contenu fourni (anti-hallucination).
   */
  private async generateTextOnlyResponseStream(
    prompt: string,
    sendEvent: (event: string, data: any) => void,
  ): Promise<string> {
    let fullText = '';
    try {
      const stream = await this.streamModel('streaming', prompt, this.MAX_TOKENS);
      for await (const chunk of stream) {
        const text = this.extractChunkText(chunk);
        if (text) {
          fullText += text;
          this.recordOutput(text, true);
          sendEvent('token', { text });
        }
      }
    } catch (err) {
      this.logger.warn(`Text streaming echoue, fallback invoke: ${(err as Error).message}`);
      const response = await this.invokeModel('fast', [{ role: 'user', content: prompt }], this.MAX_TOKENS);
      fullText = this.extractLlmText(response);
      sendEvent('token', { text: fullText });
    }

    return fullText;
  }

  private buildDocumentAnalysisPrompt(
    question: string,
    documentContext: DocumentContextItem[],
  ): string {
    const docs = documentContext
      .filter(d => !d.error && !!d.content && d.content.trim().length > 0)
      .map((d, i) => {
        const title = d.id
          ? `Document système #${d.id} — ${d.name}`
          : `Fichier joint — ${d.name || `#${i + 1}`}`;
        return `### ${title}\n${this.selectRelevantDocumentText(question, d.content, 8000)}`;
      })
      .join('\n\n');

    const role = this.projectConfig?.analysisSystemPrompt
      ?? `Tu es un assistant juridique expert qui lit et analyse des documents (contrats, jugements, conclusions, pièces…).`;

    return `${role}

Tu dois répondre à la demande de l'utilisateur en t'appuyant EXCLUSIVEMENT sur le contenu des documents ci-dessous.
⚠️ Si une information demandée ne figure pas dans les documents, dis-le explicitement. N'invente JAMAIS de contenu.

## DEMANDE DE L'UTILISATEUR
"${question}"

## CONTENU DES DOCUMENTS
${docs}

## CONSIGNES DE RÉPONSE
- Réponds en français, dans un langage clair et professionnel.
- Structure la réponse (points clés, parties, dates, montants, obligations, échéances…).
- Cite les éléments importants tels qu'ils apparaissent dans le document.
- Sois synthétique mais complet (≈ 600 mots maximum).

RÉPONSE :`;
  }

  // ai-database.service.ts
  /**
  * Formate un plan d'écriture pour l'affichage utilisateur
  */
  private formatPlanForDisplay(plan: WritePlan): string {
    let display = `**Plan d'opérations à confirmer :**\n\n`;
    display += `📋 **Description:** ${plan.humanReadable}\n\n`;
    display += `**Confiance:** ${Math.round(plan.confidence * 100)}%\n\n`;
    display += `**Opérations prévues:**\n`;
    
    for (let i = 0; i < plan.operations.length; i++) {
      const op = plan.operations[i];
      const emoji = op.operation === 'INSERT' ? '➕' : op.operation === 'UPDATE' ? '✏️' : '🗑️';
      
      display += `${i + 1}. ${emoji} **${op.operation}** sur **${op.entity}**`;
      
      if (op.entityId) {
        display += ` (ID: ${op.entityId})`;
      }
      
      display += `\n`;
      
      // Afficher les champs à modifier
      const fieldKeys = Object.keys(op.fields);
      if (fieldKeys.length > 0) {
        display += `   📝 Champs: ${fieldKeys.map(k => `"${k}"`).join(', ')}\n`;
      }
      
      // Afficher les dépendances
      if (op.tempId) {
        display += `   🔗 Référencé comme: **${op.tempId}**\n`;
      }
      
      display += `\n`;
    }
    
    display += `\n---\n`;
    display += `⚠️ **Voulez-vous confirmer cette opération ?**\n`;
    display += `✅ Confirmer | ❌ Annuler`;
    
    return display;
  }
  
  /**
   * Génère un titre automatique pour la conversation
   */
  private generateConversationTitle(question: string): string {
    // Prendre les 50 premiers caractères
    let title = question.substring(0, 50);
    if (question.length > 50) title += '...';
    return title;
  }

  /**
  * ✅ Version relaxée de extractSQL pour récupérer même les mal formattés
  */
  private extractSQLRelaxed(response: string): string | null {
    if (!response) return null;
    
    // Pattern plus permissif
    const patterns = [
      /```sql\n([\s\S]*?)\n```/i,
      /```\n([\s\S]*?)\n```/i,
      /```sql([\s\S]*?)```/i,
      /SELECT\s+[\s\S]*?(?:;|$)/i,
      /select\s+[\s\S]*?(?:;|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        const sql = match[1] || match[0];
        if (sql && /select/i.test(sql)) {
          return sql.trim().replace(/;+$/, '');
        }
      }
    }
    
    // Dernier recours : chercher tout ce qui ressemble à SELECT ... FROM
    const selectMatch = response.match(/SELECT\s+.+?\s+FROM\s+[^\s;]+/i);
    if (selectMatch) {
      return selectMatch[0].trim();
    }
    
    return null;
  }


  private installApproximateTokenCounter(model: ChatOpenAI) {
    const getNumTokens = async (content: unknown): Promise<number> => {
      const text = this.stringifyTokenContent(content);
      return Math.max(1, Math.ceil(text.length / 4));
    };

    (model as ChatOpenAI & { getNumTokens: (content: unknown) => Promise<number> }).getNumTokens = getNumTokens;
  }

  private stringifyTokenContent(content: unknown): string {
    if (content == null) {
      return '';
    }

    if (typeof content === 'string') {
      return content;
    }

    if (typeof content === 'number' || typeof content === 'boolean' || typeof content === 'bigint') {
      return String(content);
    }

    if (Array.isArray(content)) {
      return content.map((item) => this.stringifyTokenContent(item)).join('\n');
    }

    if (typeof content === 'object') {
      const record = content as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text;
      }
      if (typeof record.content === 'string') {
        return record.content;
      }

      try {
        return JSON.stringify(content);
      } catch {
        return String(content);
      }
    }

    return String(content);
  }

  private async initializeLLM() {
  this.aiModelRouter.warmUp();
  return;
  this.llm = new ChatOpenAI({
    // model: 'deepseek-v4-flash',
    // model: 'deepseek-v4-pro',
    // model: 'gemini-2.5-flash',
    model: 'GLM-5.1',
    // model: 'agnes-2.0-flash',
    temperature: 0,            // ✅ Déterministe pour des analyses précises
    maxTokens: 8000,           // Sortie max de DeepSeek-chat (≈ 8K tokens) — suffit pour SQL + analyses
    apiKey: process.env.GLM_API_KEY, 
    // apiKey: process.env.DEEPSEEK_API_KEY, 
    // apiKey: process.env.AGNES_API_KEY, 
    // configuration: {
    //   baseURL: 'https://apihub.agnes-ai.com/v1',
    // },
    configuration: {
      baseURL: 'https://api.z.ai/api/paas/v4/',
      // baseURL: 'https://api.deepseek.com',
    },
    streaming: true,           // ✅ Streaming activé (réponses longues + 1er token rapide)
    timeout: 60000,            // 60s : marge de raisonnement sans couper les analyses longues
    maxRetries: 2,
  });
  this.installApproximateTokenCounter(this.llm);
}

  /**
   * Charge automatiquement toutes les relations de la base de données
   */
  private async loadDatabaseRelationships() {
    try {
      this.logger.log('🔄 Chargement automatique des relations...');
      
      const foreignKeys = await this.dataSource.query(`
        SELECT 
          kcu.TABLE_NAME,
          kcu.COLUMN_NAME,
          kcu.REFERENCED_TABLE_NAME,
          kcu.REFERENCED_COLUMN_NAME,
          tc.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.TABLE_CONSTRAINTS tc 
          ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          AND kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
        WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
      `);
      
      const relationships = {};
      for (const fk of foreignKeys) {
        if (!relationships[fk.TABLE_NAME]) {
          relationships[fk.TABLE_NAME] = {
            foreignKeys: [],
            referencedBy: []
          };
        }
        
        relationships[fk.TABLE_NAME].foreignKeys.push({
          column: fk.COLUMN_NAME,
          referencedTable: fk.REFERENCED_TABLE_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME,
          constraint: fk.CONSTRAINT_NAME
        });
        
        if (!relationships[fk.REFERENCED_TABLE_NAME]) {
          relationships[fk.REFERENCED_TABLE_NAME] = {
            foreignKeys: [],
            referencedBy: []
          };
        }
        
        relationships[fk.REFERENCED_TABLE_NAME].referencedBy.push({
          table: fk.TABLE_NAME,
          column: fk.COLUMN_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME
        });
      }
      
      this.relationshipsCache.set('all', relationships);
      this.logger.log(`✅ ${foreignKeys.length} relations chargées`);
    } catch (error) {
      this.logger.warn(`Impossible de charger les relations: ${(error as unknown as any).message}`);
    }
  }




  /**
   * Génère une analyse métier à partir des résultats
   */
  private async generateBusinessAnalysis(
    question: string, 
    sql: string, 
    results: any, 
    tables: string[]
  ): Promise<string> {
    if (!results.data || results.data.length === 0) {
      return this.getNoResultsMessage(question, tables);
    }

    // Transformer les résultats avec des libellés métier
    const businessResults = this.transformToBusinessResults(results.data, tables);
    
    const prompt = `Tu es un expert métier spécialisé dans la gestion de dossiers contentieux et bancaires.

QUESTION POSÉE PAR L'UTILISATEUR:
"${question}"

RÉSULTATS DES DONNÉES (présentés en termes métier):
${JSON.stringify(businessResults, null, 2)}

INSTRUCTIONS IMPORTANTES:
1. Réponds comme si tu parlais à un collègue non technique (avocat, gestionnaire de dossier)
2. N'utilise JAMAIS de termes techniques comme "SQL", "requête", "base de données", "colonne", "table", "JOIN", "SELECT", "LIMIT"
3. Utilise des termes métier comme "dossier", "client", "étape", "procédure", "statut", "date"
4. Pour les champs, utilise des noms lisibles comme "Numéro de dossier", "Nom de l'étape" au lieu de "id", "name"
5. Si la réponse contient des dates, formate-les de façon lisible
6. Sois concis mais précis (max 500 mots)
7. Termine par une phrase d'action ou de recommandation si pertinent
8. IMPORTANT : pour CHAQUE élément listé (dossier, audience, client...), mentionne toujours son identifiant numérique réel entre parenthèses, ex: "Audience du 20 juin (ID: 42)". Cela permet à l'utilisateur de désigner cet élément précisément dans un message suivant (ex: "marque-la comme reportée").
9. Format d'affichage: texte simple uniquement. N'utilise pas de gras Markdown (**...**), pas de tableau Markdown, pas de HTML. Utilise des lignes courtes de type "- Libellé : valeur".

RÉPONSE (en français courant, langage métier):`;

    const response = await this.invokeModel('streaming', prompt, this.MAX_TOKENS);
    const analysis = this.extractLlmText(response).trim();
    if (analysis) return analysis;
    return this.buildFallbackAnalysisFromResults(question, results.data);
  }

  private buildFallbackAnalysisFromResults(question: string, data: any[]): string {
    const count = data.length;
    const lower = question.toLowerCase();

    const entityGuesses: Array<{ test: RegExp; singular: string; plural: string }> = [
      { test: /audience/i,    singular: 'audience',    plural: 'audiences' },
      { test: /dossier/i,     singular: 'dossier',     plural: 'dossiers' },
      { test: /client/i,      singular: 'client',      plural: 'clients' },
      { test: /facture/i,     singular: 'facture',     plural: 'factures' },
      { test: /paiement|reglement/i, singular: 'paiement', plural: 'paiements' },
      { test: /diligence|tache/i,    singular: 'diligence', plural: 'diligences' },
      { test: /document|piece/i,     singular: 'document',  plural: 'documents' },
      { test: /avocat|collaborateur/i, singular: 'collaborateur', plural: 'collaborateurs' },
      { test: /ecriture|comptab/i, singular: 'ecriture comptable', plural: 'ecritures comptables' },
    ];

    let entity = 'resultat';
    let entityPlural = 'resultats';
    for (const guess of entityGuesses) {
      if (guess.test.test(lower)) {
        entity = guess.singular;
        entityPlural = guess.plural;
        break;
      }
    }

    const label = count === 1 ? `1 ${entity} trouve` : `${count} ${entityPlural} trouves`;
    const lines = [`${label}.`];

    const sample = data.slice(0, 5);
    for (const row of sample) {
      const parts: string[] = [];
      const id = row.id ?? row.ID;
      if (id !== undefined) parts.push(`ID: ${id}`);
      for (const key of Object.keys(row)) {
        if (['id', 'ID', 'deleted_at', 'deleted_by', 'tenant_id'].includes(key)) continue;
        const val = row[key];
        if (val === null || val === undefined || val === '') continue;
        parts.push(`${key}: ${String(val).substring(0, 80)}`);
        if (parts.length >= 5) break;
      }
      lines.push(`- ${parts.join(', ')}`);
    }

    if (data.length > 5) {
      lines.push(`... et ${data.length - 5} autre(s).`);
    }

    return lines.join('\n');
  }

  /**
   * Version streaming de generateBusinessAnalysis.
   * Envoie chaque token via sendEvent('token', { text }) au fur et à mesure,
   * puis retourne la réponse complète pour l'historique.
   *
   * Compatible avec l'endpoint SSE /ask/stream uniquement.
   */
  private async generateBusinessAnalysisStream(
    question: string,
    sql: string,
    results: any,
    tables: string[],
    sendEvent: (event: string, data: any) => void,
  ): Promise<string> {
    if (!results.data || results.data.length === 0) {
      const msg = this.getNoResultsMessage(question, tables);
      this.logger.debug(`📤 token (no-results): "${msg.substring(0, 60)}"`);
      sendEvent('token', { text: msg });
      return msg;
    }

    const businessResults = this.transformToBusinessResults(results.data, tables);

    // Le rôle métier vient de projectConfig (logique externe) — générique par défaut
    const expertRole = this.projectConfig?.analysisSystemPrompt
      ?? `Tu es un assistant IA spécialisé dans l'analyse de données.`;

    const prompt = `${expertRole}

QUESTION POSÉE PAR L'UTILISATEUR:
"${question}"

RÉSULTATS DES DONNÉES (présentés en termes métier):
${JSON.stringify(businessResults, null, 2)}

INSTRUCTIONS IMPORTANTES:
1. Réponds comme si tu parlais à un collègue non technique
2. N'utilise JAMAIS de termes techniques comme "SQL", "requête", "base de données", "colonne", "table"
3. Utilise des termes métier adaptés au contexte
4. Si la réponse contient des dates, formate-les de façon lisible
5. Sois concis mais précis (max 500 mots)
6. Termine par une phrase d'action ou de recommandation si pertinent
7. IMPORTANT : pour CHAQUE élément listé (dossier, audience, client...), mentionne toujours son identifiant numérique réel entre parenthèses, ex: "Audience du 20 juin (ID: 42)". Cela permet à l'utilisateur de désigner cet élément précisément dans un message suivant (ex: "marque-la comme reportée").
8. Format d'affichage: texte simple uniquement. N'utilise pas de gras Markdown (**...**), pas de tableau Markdown, pas de HTML. Utilise des lignes courtes de type "- Libellé : valeur".

RÉPONSE (en langage naturel):`;

    let fullText = '';
    let tokenCount = 0;

    this.logger.log(`🌊 [STREAM] Démarrage llm.stream() — prompt ${prompt.length} chars`);
    try {
      const stream = await this.streamModel('streaming', prompt, this.MAX_TOKENS);
      for await (const chunk of stream) {
        const text = this.extractChunkText(chunk);
        if (text) {
          fullText += text;
          tokenCount++;
          if (tokenCount <= 3 || tokenCount % 10 === 0) {
            this.logger.debug(`🔤 [STREAM] token #${tokenCount}: "${text.replace(/\n/g, '\\n').substring(0, 30)}"`);
          }
          this.recordOutput(text, true);
          sendEvent('token', { text });
        }
      }
      this.logger.log(`✅ [STREAM] Terminé — ${tokenCount} tokens, ${fullText.length} chars`);
    } catch (err) {
      this.logger.warn(`⚠️ [STREAM] llm.stream() échoué → fallback invoke: ${(err as Error).message}`);
      const response = await this.invokeModel('streaming', prompt, this.MAX_TOKENS);
      fullText = this.extractLlmText(response);
      this.logger.debug(`📤 [FALLBACK] token unique: ${fullText.length} chars`);
      sendEvent('token', { text: fullText });
    }

    if (!fullText.trim()) {
      fullText = this.buildFallbackAnalysisFromResults(question, results.data);
      this.logger.warn(`⚠️ [STREAM] Analyse vide — fallback construit: ${fullText.substring(0, 80)}`);
      sendEvent('token', { text: fullText });
    }

    return fullText;
  }

  /**
   * Génère une réponse conversationnelle directement en streaming (llm.stream).
   * Envoie chaque token SSE dès qu'il arrive — pas de pré-génération bloquante.
   */
  private async generateConversationalResponseStream(
    question: string,
    sendEvent: (event: string, data: any) => void,
    history: VisibleHistoryMessage[] = [],
  ): Promise<string> {
    const systemPrompt = this.projectConfig?.conversationalSystemPrompt
      ?? `Tu es un assistant IA. Réponds aux questions générales et aux salutations de façon courtoise et professionnelle.`;

    let fullText = '';
    let tokenCount = 0;
    this.logger.log(`🌊 [CONV STREAM] Démarrage llm.stream() pour réponse conversationnelle`);

    try {
      const stream = await this.streamModel('streaming', [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
        { role: 'user',   content: question },
      ] as any, 1600);
      for await (const chunk of stream) {
        const text = this.extractChunkText(chunk);
        if (text) {
          fullText += text;
          tokenCount++;
          this.recordOutput(text, true);
          sendEvent('token', { text });
        }
      }
      this.logger.log(`✅ [CONV STREAM] Terminé — ${tokenCount} tokens, ${fullText.length} chars`);
    } catch (err) {
      this.logger.warn(`⚠️ [CONV STREAM] llm.stream() échoué → fallback invoke: ${(err as Error).message}`);
      const response = await this.invokeModel('fast', [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
        { role: 'user',   content: question },
      ] as any, 1200);
      fullText = this.extractLlmText(response);
      sendEvent('token', { text: fullText });
    }

    return fullText;
  }

  private async generateConversationalResponse(
    question: string,
    history: VisibleHistoryMessage[] = [],
  ): Promise<string> {
    const systemPrompt = this.projectConfig?.conversationalSystemPrompt
      ?? `Tu es un assistant IA. Reponds aux questions generales et aux salutations de facon courtoise et professionnelle.`;

    const response = await this.invokeModel('fast', [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: question },
    ] as any, 1200);

    return this.extractLlmText(response);
  }

  /**
   * @deprecated — Remplacé par generateConversationalResponseStream (qui fait du vrai streaming LLM).
   * Conservé pour compatibilité mais plus appelé depuis analyzeQuestionStream.
   */
  private streamConversationalResponse(
    preGeneratedText: string,
    sendEvent: (event: string, data: any) => void,
  ): string {
    this.logger.debug(`💬 CONVERSATIONAL stream (legacy) — ${preGeneratedText.length} chars`);
    for (const word of preGeneratedText.split(/(\s+)/)) {
      if (word) sendEvent('token', { text: word });
    }
    return preGeneratedText;
  }

  /**
   * Transforme les résultats techniques en résultats métier lisibles
   */
  private transformToBusinessResults(data: any[], tables: string[]): any[] {
    // Pour chaque ligne, on doit deviner de quelle table provient la colonne
    // Version simplifiée : on prend la première table de la liste comme contexte
    const mainTable = tables[0];
    return data.map(row => this.schemaMetadata.transformRowToBusiness(row, mainTable));
  }

  /**
   * Formate une date de façon lisible
   */
  private formatDate(date: any): string {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return date;
    }
  }

  /**
   * Message personnalisé quand aucun résultat n'est trouvé
   */
  private getNoResultsMessage(question: string, tables: string[]): string {
    const lower = question.toLowerCase();

    const rules: Array<{ test: (q: string) => boolean; message: string }> = [
      {
        test: q => /\b[eé]tape|step|procedure|parcours/i.test(q),
        message: 'Aucune etape trouvee pour ce dossier. Le dossier n\'a peut-etre pas encore de parcours procedural actif, ou l\'identifiant est incorrect.',
      },
      {
        test: q => /dossier|affaire|litige/i.test(q),
        message: 'Aucun dossier ne correspond a ces criteres. Verifiez le numero de dossier ou elargissez la recherche (periode, statut, client).',
      },
      {
        test: q => /client|customer|partie/i.test(q),
        message: 'Aucun client ne correspond a cette recherche. Verifiez l\'orthographe du nom ou essayez avec moins de criteres.',
      },
      {
        test: q => /audience/i.test(q),
        message: 'Aucune audience trouvee pour ces criteres. Verifiez la periode ou le dossier concerne.',
      },
      {
        test: q => /facture|honoraire/i.test(q),
        message: 'Aucune facture trouvee pour ces criteres. Verifiez le client, la periode ou le statut de facturation.',
      },
      {
        test: q => /paiement|reglement|encaissement/i.test(q),
        message: 'Aucun paiement enregistre pour ces criteres. Verifiez le client ou la periode.',
      },
      {
        test: q => /chiffre d.affaire|ca |revenu|recette/i.test(q),
        message: 'Aucune donnee financiere trouvee pour cette periode. Il n\'y a peut-etre pas encore de factures ou de paiements enregistres.',
      },
      {
        test: q => /diligence|tache|echeance/i.test(q),
        message: 'Aucune diligence trouvee pour ces criteres. Verifiez le dossier ou la periode concernee.',
      },
      {
        test: q => /document|piece|fichier|contrat/i.test(q),
        message: 'Aucun document ne correspond a cette recherche. Verifiez le nom du document ou le dossier associe.',
      },
      {
        test: q => /avocat|collaborateur|employe/i.test(q),
        message: 'Aucun collaborateur ne correspond a cette recherche. Verifiez le nom ou les criteres saisis.',
      },
      {
        test: q => /comptab|ecriture|journal|compte/i.test(q),
        message: 'Aucune ecriture comptable trouvee pour ces criteres. Verifiez le journal, la periode ou le compte concerne.',
      },
    ];

    for (const rule of rules) {
      if (rule.test(lower)) {
        return rule.message;
      }
    }

    // Dernier recours : construire un message à partir des tables détectées
    const tableLabels: Record<string, string> = {
      dossiers: 'dossier', customer: 'client', employee: 'collaborateur',
      audiences: 'audience', factures: 'facture', paiements: 'paiement',
      diligences: 'diligence', document_customer: 'document',
    };
    const primaryTable = tables.find(t => tableLabels[t]);
    if (primaryTable) {
      return `Aucun(e) ${tableLabels[primaryTable]} ne correspond a votre recherche. Essayez avec des criteres differents (periode, statut, nom).`;
    }

    return `Aucun resultat pour cette recherche. Essayez de reformuler avec des criteres plus precis (nom, date, statut).`;
  }

  /**
   * Détecte automatiquement les tables pertinentes
   */
  /**
   * Normalise un mot-clé pour le matching : vire les marques du pluriel français
   * pour matcher "documents" → "document", "dossiers" → "dossier", etc.
   */
  private stemKeyword(word: string): string {
    const w = word.toLowerCase();
    if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
    if (w.endsWith('x') && w.length > 3) return w.slice(0, -1);
    return w;
  }

  /**
   * Decoupe un nom de table snake_case en mots individuels
   * Ex: "document_customer" → ["document", "customer"]
   */
  private splitTableName(name: string): string[] {
    return name.toLowerCase().split('_').filter(w => w.length > 0);
  }

  private normalizeForKeywordMatch(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private containsNormalizedPhrase(normalizedText: string, normalizedPhrase: string): boolean {
    const phrase = normalizedPhrase.trim();
    if (!phrase) return false;
    return ` ${normalizedText} `.includes(` ${phrase} `);
  }

  /**
  * Detecte automatiquement les tables pertinentes avec matching ameliore :
  * - Word-level matching (decoupage en mots des noms de tables)
  * - Stemming pour gerer singulier/pluriel (ex: "documents" → "document" dans "document_customer")
  * - Matching sur la categorie BusinessTable
  * - Tri stable (score DESC + nom ASC)
  */
  private async detectRelevantTables(
    question: string,
    specificTables?: string[] | string,
    references: ReferencedEntityContext[] = [],
  ): Promise<string[]> {
    const normalizedSpecificTables = this.normalizeStringArray(specificTables);
    const cacheKey = buildAiCacheKey('tables', {
      tenantId: hasActiveTenant() ? getCurrentTenantId() : null,
      question,
      specificTables: normalizedSpecificTables ?? [],
      references: references.map(ref => ({ type: ref.type, id: ref.id ?? ref.data?.id ?? null })),
    });
    const cached = this.tableDetectionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.markMetric({ cacheHit: true });
      return [...cached.tables];
    }

    const remember = (tables: string[]) => {
      this.tableDetectionCache.set(cacheKey, { tables: [...tables], timestamp: Date.now() });
      return tables;
    };

    if (normalizedSpecificTables && normalizedSpecificTables.length > 0) {
      const validTables = normalizedSpecificTables.filter(table => 
        this.schemaMetadata.hasTableMetadata(table)
      );
      
      if (validTables.length === 0) {
        this.logger.warn(`Aucune table specifiee n'a de metadonnees, utilisation des tables par defaut`);
        return remember(this.getDefaultVisibleTables());
      }
      
      return remember(this.expandWithRelatedTables(validTables));
    }

    const referenceTables = this.getReferenceTableHints(references);
    const normalizedQuestion = this.normalizeForKeywordMatch(question);
    const keywords = normalizedQuestion.split(/\s+/).filter(Boolean);
    const visibleTables = this.schemaMetadata.getAllVisibleTables();
    const keywordStems = keywords.map(k => this.stemKeyword(k));
    const effectiveTablesConfig = this.projectConfig?.databaseTablesConfig ?? DatabaseTablesConfig;
    const tableSynonyms =
      (effectiveTablesConfig as AiDatabaseProjectConfig['databaseTablesConfig'])?.tableSynonyms ?? {};
    
    const tableScores: { name: string; score: number; reasons: string[] }[] = [];
    for (const tableName of visibleTables) {
      let score = 0;
      const reasons: string[] = [];
      
      // 1. Nom de table EXACT dans les mots-cles (ex: "dossiers")
      if (keywords.includes(tableName.toLowerCase())) {
        score += 10;
        reasons.push('exact_table_name');
      }
      
      const tableWords = this.splitTableName(tableName);
      const tableStems = tableWords.map(w => this.stemKeyword(w));
      
      const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(tableName);
      const businessName = this.normalizeForKeywordMatch(tableMeta?.label || '');
      const category = this.normalizeForKeywordMatch(tableMeta?.category || '');

      for (const synonym of tableSynonyms[tableName] ?? []) {
        const normalizedSynonym = this.normalizeForKeywordMatch(synonym);
        if (this.containsNormalizedPhrase(normalizedQuestion, normalizedSynonym)) {
          score += 12;
          reasons.push(`synonym_match:${normalizedSynonym}`);
        }
      }
      
      for (let ki = 0; ki < keywords.length; ki++) {
        const keyword = keywords[ki];
        const stem = keywordStems[ki];
        
        // 2. Word-level matching avec stemming
        // Ex: "documents" (stem="document") match "document" dans "document_customer"
        const wordMatch = tableWords.some(w => w === keyword || w === stem);
        const stemMatch = tableStems.some(s => s === keyword || s === stem);
        
        if (wordMatch || stemMatch) {
          score += 5;
          reasons.push(`word_match:${keyword}`);
        }
        
        // 2b. Fallback substring (pReserve l'ancien comportement: "dossier" matche "dossiers")
        if (tableName.toLowerCase().includes(keyword)) {
          score += 3;
          reasons.push(`contains_match:${keyword}`);
        }
        
        // 3. Label metier (ex: "Documents clients" → "documents")
        const businessWords = businessName.split(/[\s_]+/).filter(Boolean);
        const businessStems = businessWords.map(w => this.stemKeyword(w));
        
        const labelWordMatch = businessWords.some(w => w === keyword || w === stem);
        const labelStemMatch = businessStems.some(s => s === keyword || s === stem);
        
        if (labelWordMatch || labelStemMatch) {
          score += 7;
          reasons.push(`label_match:${keyword}`);
        }
        
        // 3b. Fallback substring label (ex: "Dossiers contentieux" contient "dossier")
        if (businessName.includes(keyword)) {
          score += 4;
          reasons.push(`label_contains:${keyword}`);
        }
        
        // 4. Categorie BusinessTable (ex: category: 'document' → match "documents")
        if (category) {
          const catWords = category.split(/[\s_]+/).filter(Boolean);
          const catStems = catWords.map(w => this.stemKeyword(w));
          if (catWords.some(w => w === keyword || w === stem) ||
              catStems.some(s => s === keyword || s === stem)) {
            score += 6;
            reasons.push(`category_match:${keyword}`);
          }
        }
      }
      
      if (score > 0) {
        tableScores.push({ name: tableName, score, reasons });
      }
    }
    
    // Tri stable : score DESC, puis nom ASC
    tableScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
    const detectedTables = tableScores.slice(0, referenceTables.length ? 5 : 10).map(t => t.name);
    
    this.logger.log(`🎯 Tables detectees: ${detectedTables.join(', ')}`);
    this.logger.debug(`Scores: ${JSON.stringify(tableScores.map(t => ({ name: t.name, score: t.score })))}`);
    
    if (referenceTables.length > 0) {
      const combined = [...new Set([...referenceTables, ...detectedTables])];
      const expanded = this.expandWithRelatedTables(combined, 10);
      this.logger.log(`Tables contraintes par references: ${expanded.join(', ')}`);
      return remember(expanded);
    }

    if (detectedTables.length === 0) {
      return remember(this.getDefaultVisibleTables());
    }

    return remember(this.expandWithRelatedTables(detectedTables));
  }

  private getReferenceTableHints(references: ReferencedEntityContext[]): string[] {
    if (!references.length) return [];
    const byType: Record<string, string[]> = {
      audience: ['audiences', 'dossiers', 'jurisdictions', 'audience_types'],
      hearing: ['audiences', 'dossiers', 'jurisdictions', 'audience_types'],
      dossier: ['dossiers', 'customer', 'procedure_instances', 'procedure_templates'],
      case: ['dossiers', 'customer', 'procedure_instances', 'procedure_templates'],
      client: ['customer', 'dossiers'],
      customer: ['customer', 'dossiers'],
      document: ['document_customer', 'dossiers', 'customer'],
      facture: ['factures', 'customer', 'dossiers'],
      invoice: ['factures', 'customer', 'dossiers'],
      diligence: ['diligences', 'dossiers', 'employee'],
      employee: ['employee'],
      collaborateur: ['employee'],
      supplier: ['supplier'],
      fournisseur: ['supplier'],
      referrer: ['referrer', 'dossier_referral'],
      apporteur: ['referrer', 'dossier_referral'],
    };

    return [...new Set(
      references
        .flatMap(ref => byType[String(ref.type ?? '').toLowerCase()] ?? [])
        .filter(table => this.schemaMetadata.hasTableMetadata(table)),
    )];
  }

  /**
   * Étend une liste de tables avec leurs tables FK-référencées (1 saut) afin que les
   * JOINs nécessaires soient présents dans le schéma envoyé au LLM. Sans ça, une
   * question comme « les dossiers avec le nom du client » détecte `dossiers` mais
   * pas `customer` → le LLM ne peut pas joindre → résultats incomplets ou vides.
   */
  private expandWithRelatedTables(tables: string[], max = 12): string[] {
    const relationships = this.relationshipsCache.get('all') || {};
    const out = new Set<string>(tables);

    // 1) Tables PARENTES (FK sortantes) : ex. ecritures_comptables → journaux/exercices.
    for (const t of tables) {
      const rel = relationships[t];
      if (!rel?.foreignKeys) continue;
      for (const fk of rel.foreignKeys) {
        const ref = fk.referencedTable;
        if (ref && this.schemaMetadata.hasTableMetadata(ref)) out.add(ref);
        if (out.size >= max) break;
      }
      if (out.size >= max) break;
    }

    // 2) Tables ENFANTS (FK entrantes) : ex. lignes_ecriture_comptable → ecritures_comptables.
    //    Indispensable pour les schémas « en-tête + lignes » (écritures/lignes,
    //    factures/lignes…). Sans elles, une question sur les écritures ne verrait
    //    pas la table des lignes et le LLM inventerait sa structure (cause directe
    //    des hallucinations type "ecriture_lignes(sens, montant)").
    if (out.size < max) {
      const targets = new Set(tables.map(t => t.toLowerCase()));
      for (const [child, rel] of Object.entries<any>(relationships)) {
        if (out.has(child)) continue;
        const fks = rel?.foreignKeys;
        if (!Array.isArray(fks)) continue;
        const pointsToTarget = fks.some(
          (fk: any) => fk?.referencedTable && targets.has(String(fk.referencedTable).toLowerCase()),
        );
        if (pointsToTarget && this.schemaMetadata.hasTableMetadata(child)) {
          out.add(child);
          if (out.size >= max) break;
        }
      }
    }

    return Array.from(out).slice(0, max);
  }

  /**
  * Retourne la liste des tables visibles par défaut
  */
  private getDefaultVisibleTables(): string[] {
    const allVisible = this.schemaMetadata.getAllVisibleTables();
    // Retourner les 10 premières tables visibles
    return allVisible.slice(0, 10);
  }

  /**
   * Récupère un schéma complet avec toutes les relations
   */
  private async getCompleteSchema(tables: string[]): Promise<string> {
    // ✅ Filtrer pour ne garder que les tables avec métadonnées
    const validTables = tables.filter(table => 
      this.schemaMetadata.hasTableMetadata(table)
    );
    
    if (validTables.length === 0) {
      this.logger.warn(`⚠️ Aucune table valide trouvée, utilisation des tables par défaut visibles`);
      return this.getDefaultSchema();
    }
    
    const cacheKey = validTables.sort().join(',');
    const cached = this.schemaCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      this.logger.debug(`📦 Utilisation du schéma caché pour ${validTables.length} tables`);
      return cached.schema;
    }
    
    this.logger.log(`🔄 Génération du schéma complet pour ${validTables.length} tables...`);
    
    let schema = '# SCHÉMA DE LA BASE DE DONNÉES\n\n';
    const relationships = this.relationshipsCache.get('all') || {};
    
    for (const table of validTables) {
      try {
        const tableInfo = await this.getTableInfo(table, relationships[table]);
        if (tableInfo) {
          this.logger.log(`🔄 tableau info  ${table} tables...`)
          schema += tableInfo + '\n';
        }
      } catch (error) {
        this.logger.warn(`Impossible de lire ${table}: ${(error as unknown as any).message}`);
      }
    }
    
    schema += '\n# RELATIONS ENTRE TABLES\n\n';
    for (const table of validTables) {
      const rel = relationships[table];
      if (rel?.foreignKeys) {
        for (const fk of rel.foreignKeys) {
          if (validTables.includes(fk.referencedTable)) {
            schema += `- ${table}.${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}\n`;
          }
        }
      }
    }
    
    const finalSchema = schema.substring(0, this.MAX_CHARS);
    this.schemaCache.set(cacheKey, { schema: finalSchema, timestamp: now });
    
    this.logger.log(`✅ Schéma généré (${finalSchema.length} caractères)`);
    return finalSchema;
  }

/**
 * Génère un schéma par défaut avec les tables visibles
 */
private async getDefaultSchema(): Promise<string> {
  const visibleTables = this.schemaMetadata.getAllVisibleTables();
  if (visibleTables.length === 0) {
    return "# Aucune table configurée\n\nVeuillez configurer les décorateurs BusinessTable sur vos entités.";
  }
  return this.getCompleteSchema(visibleTables);
}
  /**
  * Récupère les infos d'une table avec TOUS les détails des colonnes
  */
  private async getTableInfo(table: string, relationships?: any): Promise<string | null> {
    // Récupérer TOUTES les colonnes
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_TYPE,
        COLUMN_KEY,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_COMMENT
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // ✅ Récupérer les métadonnées pour savoir quelles colonnes ignorer
    const columnMetadata = this.columnLabelsCache.get(table) || new Map();
    const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(table);

    // ✅ Filtrer les colonnes ignorées
    const visibleColumns = columns.filter(col => {
      let meta;
      if (columnMetadata instanceof Map) {
        meta = columnMetadata.get(col.COLUMN_NAME);
      }
      // Si la colonne a ignored=true, on l'exclut
      return !meta?.ignored;
    });
    
    // Compter les lignes
    let rowCount = 0;
    try {
      const countResult = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
      rowCount = parseInt(countResult[0]?.count || '0');
    } catch { /* ignore */ }
    
    // Construction du schéma enrichi
    let schema = `## Table ${table} (${rowCount.toLocaleString()} lignes)\n\n`;

     // ✅ AJOUTER LES INFORMATIONS BUSINESS TABLE
    if (tableMeta) {
      schema += `**📋 Métier:** ${tableMeta.label}\n`;
      if (tableMeta.description) {
        schema += `**📝 Description:** ${tableMeta.description}\n`;
      }
      if (tableMeta.icon) {
        schema += `**🖼️ Icône:** ${tableMeta.icon}\n`;
      }
      if (tableMeta.category) {
        schema += `**📁 Catégorie:** ${tableMeta.category}\n`;
      }
      schema += `\n`;
    }
    schema += '| Colonne technique | Type détaillé | Contraintes | Libellé métier | Description |\n';
    schema += '|------------------|---------------|-------------|----------------|-------------|\n';
    
    for (const col of visibleColumns) {  // ✅ Utiliser visibleColumns
      // Type détaillé
      let detailedType = col.DATA_TYPE;
      if ((col.DATA_TYPE === 'enum' || col.DATA_TYPE === 'set') && col.COLUMN_TYPE) {
        detailedType = col.COLUMN_TYPE;
      } else if (col.CHARACTER_MAXIMUM_LENGTH) {
        detailedType += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
      } else if (col.NUMERIC_PRECISION) {
        detailedType += `(${col.NUMERIC_PRECISION}`;
        if (col.NUMERIC_SCALE) detailedType += `,${col.NUMERIC_SCALE}`;
        detailedType += `)`;
      }
      
      // Contraintes
      const constraints: any[] = [];
      if (col.COLUMN_KEY === 'PRI') constraints.push('🔑 PK');
      if (col.COLUMN_KEY === 'MUL') constraints.push('🔗 FK');
      if (col.IS_NULLABLE === 'NO') constraints.push('NOT NULL');
      if (col.EXTRA?.includes('auto_increment')) constraints.push('AUTO_INCREMENT');
      if (col.COLUMN_DEFAULT) constraints.push(`DEFAULT ${col.COLUMN_DEFAULT}`);
      
      // Libellé métier
      const businessLabel = this.schemaMetadata.getBusinessLabel(table, col.COLUMN_NAME);
      
      // Description
      let description = col.COLUMN_COMMENT || '';
      if (!description) {
        const metaDesc = this.schemaMetadata.getColumnDescription(table, col.COLUMN_NAME);
        description = metaDesc || this.getDefaultDescription(col.COLUMN_NAME);
      }
      
      schema += `| ${col.COLUMN_NAME} | ${detailedType} | ${constraints.join(', ') || '-'} | ${businessLabel} | ${description.substring(0, 240)}${description.length > 240 ? '...' : ''} |\n`;
    }
    
    // Ajouter les relations (filtrer aussi les colonnes FK ignorées)
    if (relationships?.foreignKeys?.length > 0) {
      schema += '\n### 🔗 Clés étrangères\n\n';
      for (const fk of relationships.foreignKeys) {
        // ✅ Vérifier si la colonne FK n'est pas ignorée
        let fkMeta;
        if (columnMetadata instanceof Map) {
          fkMeta = columnMetadata.get(fk.column);
        }
        if (!fkMeta?.ignored) {
          const fkLabel = this.schemaMetadata.getBusinessLabel(table, fk.column);
          const refTableLabel = this.schemaMetadata.getTableLabel(fk.referencedTable);
          schema += `- **${fkLabel}** (${fk.column}) → **${refTableLabel}** (${fk.referencedTable}.${fk.referencedColumn})\n`;
        }
      }
    }
    
    // ⚠️ HINT spécial pour la table employee : les noms sont dans user
    if (table === 'employee') {
      schema += '\n### ⚠️ ATTENTION : Noms des collaborateurs\n\n';
      schema += 'La table "employee" ne contient PAS les colonnes "last_name" ni "first_name".\n';
      schema += 'Ces colonnes se trouvent dans la table "user", liée via une clé primaire partagée (employee.id = user.id).\n';
      schema += 'Pour récupérer le nom/prénom d\'un collaborateur, tu DOIS faire un LEFT JOIN avec "user" sur user.id = employee.id\n';
      schema += 'et sélectionner user.last_name et user.first_name.\n';
      schema += 'Ne JAMAIS utiliser employee.last_name ou employee.first_name — ces colonnes n\'existent PAS.\n';
      schema += 'Pour le nom complet : CONCAT(user.first_name, \' \', user.last_name).\n';
    }
    
    return schema;
  }

  private async getTableInfoJson(table: string, relationships?: any): Promise<TableSchema | null> {
    // ✅ Vérifier si la table doit être incluse (basé sur les métadonnées)
    const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(table);
    
    // Si la table n'a PAS de métadonnées, elle ne doit pas être incluse
    if (!tableMeta) {
      this.logger.debug(`⏭️ Table sans métadonnées (ignorée): ${table}`);
      return null;
    }
    
    // Si la table est explicitement ignorée
    if (tableMeta.ignored === true) {
      this.logger.debug(`⏭️ Table explicitement ignorée: ${table}`);
      return null;
    }
    
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_TYPE,
        COLUMN_KEY,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_COMMENT
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // ✅ Récupérer les métadonnées des colonnes depuis le cache
    const columnMetadataMap = this.schemaMetadata.getColumnMetadataMap(table);
    
    // Compter les lignes
    let rowCount = 0;
    try {
      const countResult = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
      rowCount = parseInt(countResult[0]?.count || '0');
    } catch { /* ignore */ }
    
    const columnsSchema: ColumnSchema[] = [];
    const primaryKeys: string[] = [];
    const foreignKeysList: { column: string; references: { table: string; column: string } }[] = [];
    
    for (const col of columns) {
      // ✅ Vérifier si la colonne doit être ignorée
      const columnMeta = columnMetadataMap?.get(col.COLUMN_NAME);
      if (columnMeta?.ignored === true) {
        continue; // Ignorer cette colonne
      }
      
      // Type détaillé
      let detailedType = col.DATA_TYPE;
      if ((col.DATA_TYPE === 'enum' || col.DATA_TYPE === 'set') && col.COLUMN_TYPE) {
        detailedType = col.COLUMN_TYPE;
      } else if (col.CHARACTER_MAXIMUM_LENGTH) {
        detailedType += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
      } else if (col.NUMERIC_PRECISION) {
        detailedType += `(${col.NUMERIC_PRECISION}`;
        if (col.NUMERIC_SCALE) detailedType += `,${col.NUMERIC_SCALE}`;
        detailedType += `)`;
      }
      
      // Contraintes
      const constraints: string[] = [];
      if (col.COLUMN_KEY === 'PRI') {
        constraints.push('PK');
        primaryKeys.push(col.COLUMN_NAME);
      }
      if (col.COLUMN_KEY === 'MUL') constraints.push('FK');
      if (col.IS_NULLABLE === 'NO') constraints.push('NOT NULL');
      if (col.EXTRA?.includes('auto_increment')) constraints.push('AUTO_INCREMENT');
      
      // ✅ Libellé métier (priorité: décorateur > généré)
      let businessLabel: string;
      let description: string;
      
      if (columnMeta) {
        businessLabel = columnMeta.label || this.schemaMetadata.formatTechnicalName(col.COLUMN_NAME);
        description = columnMeta.description || col.COLUMN_COMMENT || '';
      } else {
        businessLabel = this.schemaMetadata.formatTechnicalName(col.COLUMN_NAME);
        description = col.COLUMN_COMMENT || '';
      }
      
      // Vérifier si c'est une FK
      let isForeignKey = false;
      let foreignKeyTo: { table: string; column: string } | undefined;
      
      if (relationships?.foreignKeys) {
        const fk = relationships.foreignKeys.find((f: any) => f.column === col.COLUMN_NAME);
        if (fk) {
          isForeignKey = true;
          foreignKeyTo = {
            table: fk.referencedTable,
            column: fk.referencedColumn
          };
          foreignKeysList.push({
            column: col.COLUMN_NAME,
            references: { table: fk.referencedTable, column: fk.referencedColumn }
          });
        }
      }
      
      columnsSchema.push({
        name: col.COLUMN_NAME,
        type: detailedType,
        constraints,
        businessLabel,
        description: description.substring(0, 300),
        isForeignKey,
        foreignKeyTo
      });
    }
    
    return {
      name: table,
      businessName: tableMeta.label,
      description: tableMeta.description || '',
      rowCount,
      columns: columnsSchema,
      primaryKeys,
      foreignKeys: foreignKeysList,
      indexedColumns: []
    };
  }

  // Dans AiDatabaseService
  public async getCompleteSchemaJson(tables: string[]): Promise<DatabaseSchema> {
    // Cache (TTL = CACHE_TTL) : getTableInfoJson déclenche COUNT(*) + information_schema
    // par table — coûteux à régénérer. Clé = liste de tables triée.
    const cacheKey = [...tables].sort().join(',');
    const cachedJson = this.schemaJsonCache.get(cacheKey);
    if (cachedJson && (Date.now() - cachedJson.timestamp) < this.CACHE_TTL) {
      return cachedJson.value;
    }

    const relationships = this.relationshipsCache.get('all') || {};
    const resultTables: TableSchema[] = [];
    const allRelationships: { from: { table: string; column: string }; to: { table: string; column: string } }[] = [];
    
    for (const table of tables) {
      // ✅ Vérifier si la table n'est pas ignorée
      const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(table);
      this.logger.debug(`⏭️ Table (JSON): ${tableMeta}`);
      if (tableMeta?.ignored) {
        this.logger.debug(`⏭️ Table ignorée (JSON): ${table}`);
        continue;  // Passer cette table
      }
      
      const tableInfo = await this.getTableInfoJson(table, relationships[table]);
      if (tableInfo) {
        resultTables.push(tableInfo);
        
        // Ajouter les relations
        for (const fk of tableInfo.foreignKeys) {
          allRelationships.push({
            from: { table: tableInfo.name, column: fk.column },
            to: { table: fk.references.table, column: fk.references.column }
          });
        }
      }
    }
    
    const result: DatabaseSchema = {
      database: process.env.DB_NAME || 'unknown',
      generatedAt: new Date().toISOString(),
      tables: resultTables,
      relationships: allRelationships
    };
    this.schemaJsonCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  }

  private async generateSQLQuery(question: string, schema: string, tables: string[]): Promise<string> {
    // Utiliser le prompt validé
    const prompt = await this.sqlValidator.buildValidatedPrompt(question, schema, tables);
    const response = await this.invokeModel('quality', prompt, 1200);
    let sql = this.extractSQL(this.extractLlmText(response));
    
    if (!sql) {
      throw new Error('Impossible d\'extraire la requête SQL');
    }
    
    // Valider et corriger automatiquement
    const validation = await this.sqlValidator.validateAndFixSql(sql, tables);
    
    if (!validation.valid) {
      this.logger.warn(`⚠️ Corrections appliquées: ${validation.errors.join(', ')}`);
    }
    
    return validation.fixedSql;
  }
  /**
  * Récupère une description par défaut pour une colonne technique
  */
  private getDefaultDescription(columnName: string): string {
    const descriptions: Record<string, string> = {
      id: 'Identifiant unique',
      created_at: 'Date de création',
      updated_at: 'Date de dernière modification',
      deleted_at: 'Date de suppression logique',
      status: 'Statut de l\'enregistrement',
      type: 'Type ou catégorie',
      name: 'Nom',
      title: 'Titre',
      description: 'Description détaillée',
      code: 'Code unique',
      reference: 'Référence externe',
      amount: 'Montant',
      date: 'Date',
      email: 'Adresse email',
      phone: 'Numéro de téléphone',
      address: 'Adresse postale',
      is_active: 'Est actif',
      is_deleted: 'Est supprimé',
      priority: 'Priorité',
      order: 'Ordre d\'affichage',
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
      if (columnName.toLowerCase().includes(key)) {
        return desc;
      }
    }
    return '—';
  }

  // Version améliorée du prompt
  private buildGenericPrompt(question: string, schema: string, tables: string[]): string {
    return `Tu es un expert SQL générant des requêtes POUR RÉPONDRE À UNE QUESTION MÉTIER.

  ${schema}

  📋 **QUESTION MÉTIER :** "${question}"

  🎯 **RÈGLES CRITIQUES :**

  1. **IGNORE TOTALEMENT** les colonnes "deleted_at", "deleted_by", "deleted_date"
  2. **NE JAMAIS filtrer** sur ces colonnes dans WHERE
  3. **N'UTILISE JAMAIS** les paramètres nommés comme :dossier_id, :param, etc.
  4. Utilise des alias courts (d = dossiers, c = customers)
  5. Ajoute toujours LIMIT ${this.MAX_RESULTS}
  6. Pour la date du jour, utilise **CURDATE()** (ex: WHERE d.created_at >= CURDATE() - INTERVAL 7 DAY)
  7. Pour le timestamp actuel, utilise **NOW()**
  8. Pour comparer une partie d'une date, utilise **DATE()** (ex: WHERE DATE(d.created_at) = CURDATE())
  9. **TOUTES les valeurs doivent être en dur** (pas de placeholders)

  ❌ **STRICTEMENT INTERDIT :**
  - DELETE, UPDATE, INSERT, DROP, ALTER, CREATE, TRUNCATE
  - Toute mention de "deleted_at" dans la requête
  - Les paramètres nommés (:, @, $)
  - Les placeholders (?) dans la requête
  - CURDATE sans parenthèses (toujours CURDATE())

  ✅ **BONNE PRATIQUE :**
  \`\`\`sql
  SELECT d.id, d.dossier_number, d.title
  FROM dossiers d
  WHERE d.dossier_number = 'ABC123' AND d.status = 'active'
  LIMIT 10;
  \`\`\`

  📤 **RÉPONSE UNIQUEMENT** avec la requête SQL dans un bloc \`\`\`sql`;
  }

  private async validateAndFixQuery(
    sqlQuery: string,
    tables: string[],
    schema?: string,
    questionContext?: string,
  ): Promise<string> {
    let currentQuery = sqlQuery;
    let attempts = 0;
    const maxAttempts = 2;
    let lastError: string | undefined;
    const readDomainRules = this.buildReadDomainRulesBlock();

    while (attempts < maxAttempts) {
      const validation = await this.validateQuery(currentQuery);

      if (validation.valid) {
        return currentQuery;
      }

      lastError = validation.error;
      this.logger.warn(`Requête invalide (tentative ${attempts + 1}): ${validation.error}`);

      // ⚠️ Le prompt de correction DOIT inclure le vrai schéma : sans les colonnes
      // réelles, le LLM ne peut pas corriger une table/colonne hallucinée et se
      // contente de renommer au hasard. On lui redonne donc le schéma complet.
      const fixPrompt = `Tu corriges une requête SQL MySQL invalide.

## SCHÉMA RÉEL (seules ces tables/colonnes existent — n'en invente AUCUNE autre)
${(schema ?? '').substring(0, 9000) || `Tables disponibles: ${tables.join(', ') || '(non précisées)'}`}

${questionContext ? `## QUESTION MÉTIER
${questionContext}
` : ''}

${readDomainRules ? `## RÈGLES MÉTIER READ
${readDomainRules}
` : ''}

## REQUÊTE INVALIDE
\`\`\`sql
${currentQuery}
\`\`\`

## ERREUR MYSQL
${validation.error}

## CONSIGNES
- Utilise EXCLUSIVEMENT les tables et colonnes EXACTEMENT présentes dans le schéma ci-dessus (nom caractère par caractère).
- N'utilise jamais de placeholder (?, :id, @param). Les valeurs doivent être écrites en dur depuis la question ou le contexte métier.
- Pour une question de suivi ("cette facture", "ce dossier"), réutilise les contraintes métier connues au lieu d'inventer un filtre vide comme numero = ?.
- Si la table/colonne fautive n'existe pas, remplace-la par la vraie (ex: une table de lignes "en-tête + lignes" s'appelle souvent "lignes_..." avec des colonnes "debit"/"credit", pas "sens"/"montant").
- Si la donnée demandée est impossible avec ce schéma, renvoie \`SELECT NULL AS message WHERE 1=0\`.
- Reste un SELECT, garde le LIMIT ${this.MAX_RESULTS}.
Retourne UNIQUEMENT la requête SQL corrigée dans un bloc \`\`\`sql.`;

      const response = await this.invokeModel('quality', fixPrompt, 1000);
      const fixedQuery = this.extractSQL(this.extractLlmText(response));

      if (fixedQuery) {
        currentQuery = fixedQuery;
      }

      attempts++;
    }

    // 🛟 Dernier contrôle : si la requête est TOUJOURS invalide après les tentatives,
    // on n'exécute PAS du SQL cassé (qui renverrait une erreur technique brute à
    // l'utilisateur). On renvoie une requête vide → le flux affichera "aucun
    // résultat" proprement plutôt qu'un "Table doesn't exist".
    const finalCheck = await this.validateQuery(currentQuery);
    if (!finalCheck.valid) {
      this.logger.error(
        `❌ Requête toujours invalide après ${maxAttempts} corrections — repli sur requête vide. ` +
        `Dernière erreur: ${lastError ?? finalCheck.error}`,
      );
      // Le SELECT doit rester en tête (un commentaire en préfixe casserait le
      // contrôle startsWith('select') en aval et déclencherait un faux re-routage WRITE).
      return `SELECT NULL AS message WHERE 1=0`;
    }

    return currentQuery;
  }

  private basicQueryFix(sql: string): string {
    let fixed = sql;
    if (!fixed.toLowerCase().includes('limit')) {
      fixed = fixed.replace(/;+$/, '') + ` LIMIT ${this.MAX_RESULTS}`;
    }
    return fixed;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ISOLATION TENANT — lecture de requêtes SQL générées par l'IA
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retourne l'ensemble des noms de tables qui ont une colonne tenant_id
   * (= toutes les entités qui étendent TenantEntity).
   * Résultat mis en cache dans la propriété privée.
   */
  private _tenantTablesCache: Set<string> | null = null;
  private getTenantTables(): Set<string> {
    if (this._tenantTablesCache) return this._tenantTablesCache;
    const tables = new Set<string>();
    for (const meta of this.dataSource.entityMetadatas) {
      const hasTenant = meta.columns.some(
        c => c.propertyName === 'tenant_id' || c.databaseName === 'tenant_id',
      );
      if (hasTenant && meta.tableName) {
        tables.add(meta.tableName.toLowerCase());
      }
    }
    this._tenantTablesCache = tables;
    return tables;
  }

  /**
   * Sous-ensemble des tables tenant marquées @SharedAcrossTenants (référentiels
   * globaux seedés avec tenant_id = 1). En lecture, elles doivent être filtrées
   * par `tenant_id IN (1, X)` — comme le fait déjà TenantRepositoryPatch — sinon
   * les données globales sont invisibles → « aucun résultat » sur les référentiels.
   */
  private _sharedTenantTablesCache: Set<string> | null = null;
  private getSharedTenantTables(): Set<string> {
    if (this._sharedTenantTablesCache) return this._sharedTenantTablesCache;
    const tables = new Set<string>();
    for (const meta of this.dataSource.entityMetadatas) {
      const target = meta.target;
      if (typeof target === 'function' && isSharedEntity(target) && meta.tableName) {
        tables.add(meta.tableName.toLowerCase());
      }
    }
    this._sharedTenantTablesCache = tables;
    return tables;
  }

  /**
   * Post-processeur SQL : injecte automatiquement les conditions tenant_id
   * sur toutes les tables référencées dans le SELECT qui ont cette colonne.
   *
   * Exemple :
   *   SELECT d.id FROM dossiers d JOIN customers c ON d.customer_id = c.id WHERE d.statut='actif'
   *   → WHERE d.tenant_id = 5 AND c.tenant_id = 5 AND d.statut='actif'
   *
   * Idempotent : si la condition existe déjà pour un alias, elle n'est pas dupliquée.
   */
  private injectTenantConditions(sql: string, tenantId: number): string {
    if (!tenantId || tenantId === 1) return sql; // tenant 1 = accès global (admin)
    const tenantTables = this.getTenantTables();
    if (tenantTables.size === 0) return sql;

    // Mots-clés SQL réservés qui ne peuvent PAS être des alias de table
    const SQL_KEYWORDS = new Set([
      'where', 'on', 'set', 'limit', 'order', 'group', 'having', 'union',
      'left', 'right', 'inner', 'outer', 'cross', 'join', 'select', 'from',
      'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between', 'exists',
      'case', 'when', 'then', 'else', 'end', 'as', 'by', 'asc', 'desc',
      'distinct', 'all', 'any', 'into', 'values', 'insert', 'update',
      'delete', 'create', 'drop', 'alter', 'index', 'table', 'view',
    ]);

    /** Résout l'alias d'une table : si le mot capturé est un mot-clé SQL, ignore-le. */
    const resolveAlias = (tableName: string, captured: string | undefined): string => {
      const raw = captured?.toLowerCase();
      if (raw && !SQL_KEYWORDS.has(raw)) return raw;
      return tableName.toLowerCase(); // pas d'alias → utiliser le nom de table
    };

    // Construire la map alias → tableName pour les tables tenant-aware
    const aliasMap = new Map<string, string>(); // alias → tableName

    // FIX 1 — l'alias est entièrement optionnel : `(?:\s+(?:AS\s+)?alias)?`
    // Avant : `\s+` était obligatoire → `FROM table` (fin de string) ne matchait pas.
    // FROM table [AS alias]
    const fromRe = /\bFROM\s+`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\b/gi;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(sql)) !== null) {
      const tbl = m[1].toLowerCase();
      const alias = resolveAlias(tbl, m[2]);
      if (tenantTables.has(tbl)) aliasMap.set(alias, tbl);
    }

    // [LEFT|RIGHT|INNER|OUTER|CROSS] JOIN table [AS alias]
    const joinRe = /\bJOIN\s+`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\b/gi;
    while ((m = joinRe.exec(sql)) !== null) {
      const tbl = m[1].toLowerCase();
      const alias = resolveAlias(tbl, m[2]);
      if (tenantTables.has(tbl)) aliasMap.set(alias, tbl);
    }

    if (aliasMap.size === 0) {
      this.logger.warn(`[Tenant] ⚠️ Aucune table tenant détectée dans la requête — injection impossible`);
      return sql;
    }

    // FIX 2 — idempotence : ne sauter que si le BON tenant_id est déjà présent.
    // Avant : `tenant_id =` sans valeur → le LLM pouvait mettre tenant_id = 0 et
    // tromper le check. On vérifie maintenant `alias.tenant_id = <tenantId>` exact.
    // FIX 4 — entités @SharedAcrossTenants (référentiels globaux) : on filtre par
    // tenant_id IN (1, X) au lieu de = X, sinon les données globales (tenant_id=1)
    // sont masquées → « aucun résultat » sur les types/catégories/référentiels.
    const sharedTables = this.getSharedTenantTables();
    const newConditions = Array.from(aliasMap.entries())
      .map(([alias, tbl]) => {
        const isShared = sharedTables.has(tbl);
        const condition = isShared
          ? `${alias}.tenant_id IN (1, ${tenantId})`
          : `${alias}.tenant_id = ${tenantId}`;
        // Idempotence : ne pas réinjecter si la condition correcte est déjà présente
        const already = isShared
          ? new RegExp(`\\b${alias}\\.tenant_id\\s+IN\\s*\\(\\s*1\\s*,\\s*${tenantId}\\s*\\)`, 'i')
          : new RegExp(`\\b${alias}\\.tenant_id\\s*=\\s*${tenantId}\\b`, 'i');
        return already.test(sql) ? null : condition;
      })
      .filter((c): c is string => c !== null);

    if (newConditions.length === 0) return sql; // déjà correctement filtré ✅

    const conditions = newConditions.join(' AND ');
    this.logger.debug(`[Tenant] injection SQL tenant_id=${tenantId}: ${conditions}`);

    if (/\bWHERE\b/i.test(sql)) {
      // FIX 3 — protection OR-bypass : on enveloppe la condition existante entre ()
      // Avant : `WHERE ${cond} AND <existing>` — si <existing> = `x OR 1=1`,
      // résultat = `WHERE (cond AND x) OR 1=1` → retourne tout.
      // Après  : `WHERE (<existing>) AND (${cond})` — la parenthèse isole le OR.
      const whereRe = /^([\s\S]*?\bWHERE\b\s*)([\s\S]*?)(\s*(?:\b(?:ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT)\b[\s\S]*)?;?\s*)$/i;
      const wm = whereRe.exec(sql);
      if (wm) {
        const existingCond = wm[2].trim();
        return `${wm[1]}(${existingCond}) AND (${conditions})${wm[3]}`;
      }
      // Fallback (ne devrait pas arriver)
      return sql.replace(/\bWHERE\b\s*/i, `WHERE ${conditions} AND `);
    }

    // Pas de WHERE : insérer avant ORDER BY / GROUP BY / HAVING / LIMIT
    const insertBefore = /\b(ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT)\b/i;
    if (insertBefore.test(sql)) {
      return sql.replace(insertBefore, (_, kw) => `WHERE ${conditions}\n${kw}`);
    }

    // Dernier recours : ajouter en fin de requête
    return sql.trimEnd().replace(/;?\s*$/, ` WHERE ${conditions}`);
  }

  /**
   * Construit le prompt système tenant-aware.
   * Si un tenantId actif est détecté, injecte une règle explicite :
   * "toutes les requêtes DOIVENT filtrer par tenant_id = X".
   */
  private buildTenantAwareSystemPrompt(tenantId: number | null): string {
    const base = this.cachedSystemPrompt ?? '';
    if (!tenantId || tenantId === 1) return base;

    const tenantRule = `
    ⚠️ RÈGLE TENANT OBLIGATOIRE (ne jamais ignorer) :
    Cette session appartient au cabinet avec tenant_id = ${tenantId}.
    CHAQUE table métier possède une colonne tenant_id.
    Tu DOIS filtrer par tenant_id = ${tenantId} pour CHAQUE table mentionnée dans tes requêtes.

    Exemple CORRECT :
    \`\`\`sql
    SELECT d.id, d.reference FROM dossiers d
    LEFT JOIN customers c ON d.customer_id = c.id AND c.tenant_id = ${tenantId}
    WHERE d.tenant_id = ${tenantId} AND d.statut = 'actif'
    LIMIT ${this.MAX_RESULTS};
    \`\`\`
    Exemple INTERDIT (oubli du tenant_id) :
    \`\`\`sql
    SELECT d.id FROM dossiers d WHERE d.statut = 'actif'; -- ❌
    \`\`\`

    `;

    // Injecter la règle tenant juste avant les RÈGLES ABSOLUES
    return base.replace(
      /RÈGLES ABSOLUES\s*:/i,
      `${tenantRule}    RÈGLES ABSOLUES :`,
    );
  }

  /**
   * Remplace les valeurs spéciales utilisées par le LLM dans les requêtes SQL :
   * - {{today}} → CURDATE() (date du jour)
   * - {{now}}  → NOW()    (timestamp actuel)
   * - CURDATE  → CURDATE() si parenthèses manquantes (correction automatique)
   */
  private replaceSpecialValues(sql: string): string {
    return sql
      // {{today}} et {{now}} (documentés dans le prompt de détection d'intention)
      .replace(/\{\{today\}\}/gi, 'CURDATE()')
      .replace(/\{\{now\}\}/gi, 'NOW()')
      // CURDATE sans parenthèses → CURDATE() (erreur fréquente du LLM)
      .replace(/\bCURDATE\b(?!\s*\()/gi, 'CURDATE()')
      // CURRENT_DATE sans parenthèses ou style SQL standard → CURDATE()
      .replace(/\bCURRENT_DATE\b(?!\s*\()/gi, 'CURDATE()')
      // NOW sans parenthèses → NOW()
      .replace(/\bNOW\b(?!\s*\()/gi, 'NOW()')
      // CURRENT_TIMESTAMP sans parenthèses → NOW()
      .replace(/\bCURRENT_TIMESTAMP\b(?!\s*\()/gi, 'NOW()')
      // SYSDATE sans parenthèses → NOW()
      .replace(/\bSYSDATE\b(?!\s*\()/gi, 'NOW()');
  }

  private stripSqlLiteralsAndComments(sql: string): string {
    return sql
      .replace(/'([^'\\]|\\.|'')*'/g, "''")
      .replace(/"([^"\\]|\\.|"")*"/g, '""')
      .replace(/`([^`]|``)*`/g, '``')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  }

  private findSqlPlaceholders(sql: string): string[] {
    const stripped = this.stripSqlLiteralsAndComments(sql);
    const placeholders = new Set<string>();

    if (/\?/.test(stripped)) {
      placeholders.add('?');
    }

    for (const match of stripped.matchAll(/(?<!:):[A-Za-z_][A-Za-z0-9_]*/g)) {
      placeholders.add(match[0]);
    }

    for (const match of stripped.matchAll(/@[A-Za-z_][A-Za-z0-9_]*/g)) {
      placeholders.add(match[0]);
    }

    return Array.from(placeholders);
  }

  private getSqlPlaceholderError(sql: string): string | null {
    const placeholders = this.findSqlPlaceholders(sql);
    if (placeholders.length === 0) return null;
    return `La requête contient des placeholders non résolus (${placeholders.join(', ')}). ` +
      `Les requêtes READ générées par l'IA doivent contenir les vraies valeurs SQL ` +
      `issues de la question ou de l'historique.`;
  }

  /**
   * Prépare une requête READ avant validation/exécution pour éviter les écarts
   * entre la requête "explainée" et la requête réellement lancée.
   */
  private prepareReadQuery(sqlQuery: string): string {
    let preparedQuery = sqlQuery.trim();

    preparedQuery = this.replaceSpecialValues(preparedQuery);
    // Ne supprime que les parenthèses réellement orphelines, pas les appels
    // de fonction valides comme CURDATE() ou NOW().
    preparedQuery = preparedQuery.replace(/(?<![A-Za-z0-9_])\(\s*\)/g, '');

    const activeTenantId = hasActiveTenant() ? getCurrentTenantId() : null;
    if (activeTenantId && activeTenantId !== 1) {
      preparedQuery = this.injectTenantConditions(preparedQuery, activeTenantId);
    }

    return preparedQuery;
  }

  /**
   * Renvoie true si la requête est bien un SELECT (après nettoyage).
   * Utilisé pour détecter, en voie READ, une requête d'écriture mal classée
   * et la re-router vers la voie WRITE plutôt que de la bloquer.
   */
  private isSelectQuery(sqlQuery: string): boolean {
    return this.prepareReadQuery(sqlQuery).trim().toLowerCase().startsWith('select');
  }

  /**
   * Exécute un plan d'écriture en streaming et gère les cas particuliers
   * (ambiguïté FK, identifiant manquant). Factorisé pour être appelé à la fois
   * par la branche WRITE normale et par le filet de sécurité de re-routage READ→WRITE.
   *
   * NB : la vérification requiresConfirmation et l'ajout du message utilisateur
   * sont gérés par l'appelant (logique différente selon le point d'entrée).
   */
  private async executeWritePlanStream(
    plan: WritePlan,
    userId: string,
    conversationId: string,
    dto: AskQuestionDto,
    fileInfo: any,
    startTime: number,
    sendEvent: (event: string, data: any) => void,
  ): Promise<void> {
    try {
      const results = await this.genericWriteService.executePlan(plan, userId);
      const analysis = this.formatPlanResults(results);
      await this.conversationManager.addAssistantMessage(conversationId, analysis, undefined);
      sendEvent('result', {
        success: true, question: dto.question, analysis, results,
        conversationId, executionTimeMs: Date.now() - startTime,
        ...(fileInfo && { fileInfo }),
      });
    } catch (error: any) {
      if (error instanceof AmbiguityException) {
        sendEvent('ambiguity', {
          entity: error.entity,
          fieldName: error.fieldName,
          searchTerm: error.searchTerm,
          candidates: error.candidates,
          operationIndex: error.operationIndex,
          parentEntity: error.parentEntity,
          message: this.buildAmbiguityMessage(error),
          pendingWritePlan: plan,
          conversationId,
          allowOther: true,
          otherLabel: this.getFieldLabel(error.fieldName),
        });
      } else if (error instanceof EntityIdRequiredException) {
        // On garde le plan en mémoire (par conversation) au lieu de le perdre :
        // au message suivant, on tentera d'en extraire l'ID donné par l'utilisateur.
        this.rememberPendingEntityIdClarification(
          conversationId, plan, error.operationIndex, error.entity, userId,
        );
        const message = `❓ Je n'ai pas pu identifier précisément quel(le) ${error.entity.replace(/s$/, '')} modifier. Donnez-moi son identifiant ou un critère unique (ex: "c'est l'audience 6") et je continuerai.`;
        await this.conversationManager.addAssistantMessage(conversationId, message, undefined);
        sendEvent('result', {
          success: true, question: dto.question, analysis: message,
          conversationId, executionTimeMs: Date.now() - startTime,
        });
      } else {
        sendEvent('error', { message: error.message });
      }
    }
  }

  private async executeSafeQuery(sqlQuery: string): Promise<{ data: any[]; rowCount: number }> {
    const placeholderError = this.getSqlPlaceholderError(sqlQuery);
    if (placeholderError) {
      throw new Error(placeholderError);
    }

    // execQuery est la requête nettoyée + enrichie qui sera réellement exécutée
    const execQuery = this.prepareReadQuery(sqlQuery);

    // normalizedQuery (lowercase) sert uniquement à la validation de sécurité
    const normalizedQuery = execQuery.toLowerCase();
    
    if (!normalizedQuery.startsWith('select')) {
      throw new Error('Seules les requêtes SELECT sont autorisées');
    }
    
    const dangerousPatterns = [
      /^\s*drop\s+/m,
      /^\s*delete\s+from/m,
      /^\s*update\s+\w+\s+set/m,
      /^\s*insert\s+into/m,
      /^\s*alter\s+table/m,
      /^\s*create\s+/m,
      /^\s*truncate\s+/m,
      /^\s*exec(ute)?\s+/m
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalizedQuery)) {
        throw new Error(`Requête non autorisée détectée`);
      }
    }
    
    
    try {
      // Exécuter execQuery (nettoyée + tenant injecté), pas sqlQuery (l'original brut)
      const results = await this.dataSource.query(execQuery);
      const limitedResults = results.slice(0, this.MAX_RESULTS);

      return {
        data: limitedResults,
        rowCount: limitedResults.length,
      };
    } catch (error) {
      const dbMessage = (error as unknown as any).message;
      this.logger.error(`Erreur SQL après préparation: ${dbMessage}\nQuery:\n${execQuery}`);
      throw new Error(`Erreur d'exécution: ${dbMessage}\nSQL: ${execQuery}`);
    }
  }

  /**
    * ✅ Version améliorée de extractSQL avec type checking
    */
    private extractSQL(response: string): string | null {
      if (!response || typeof response !== 'string') {
        this.logger.warn('Réponse invalide pour extractSQL');
        return null;
      }
      
      const patterns = [
        /```sql\n([\s\S]*?)\n```/i,
        /```\n([\s\S]*?)\n```/i,
        /SELECT\s+[\s\S]*?(?:;|$)/i
      ];
      
      for (const pattern of patterns) {
        const match = response.match(pattern);
        if (match) {
          const sql = match[1] || match[0];
          if (sql && sql.toLowerCase().includes('select')) {
            return sql.trim().replace(/;+$/, '');
          }
        }
      }
      
      return null;
    }

  async validateQuery(sqlQuery: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const placeholderError = this.getSqlPlaceholderError(sqlQuery);
      if (placeholderError) {
        return { valid: false, error: placeholderError };
      }

      const preparedQuery = this.prepareReadQuery(sqlQuery);
      await this.dataSource.query(`EXPLAIN ${preparedQuery}`);
      return { valid: true };
    } catch (error) {
      const dbMessage = (error as unknown as any).message;
      const preparedQuery = this.prepareReadQuery(sqlQuery);
      this.logger.warn(`Validation SQL invalide: ${dbMessage}\nQuery:\n${preparedQuery}`);
      return { valid: false, error: `${dbMessage}\nSQL: ${preparedQuery}` };
    }
  }

  async executeQuery(sqlQuery: string, user: AiUserContext | string): Promise<any> {
    await this.aiPermissionService.assertCanReadSql(user as AiUserContext, sqlQuery);
    const result = await this.executeSafeQuery(sqlQuery);
    return {
      success: true,
      data: result.data,
      rowCount: result.rowCount,
    };
  }

  async getDatabaseMetrics() {
    const metrics = {
      rowCounts: {} as Record<string, number>,
      relationships: this.relationshipsCache.get('all') ? Object.keys(this.relationshipsCache.get('all')).length : 0,
      lastAnalyzed: new Date(),
    };
    
    const effectiveTablesConfig = this.projectConfig?.databaseTablesConfig ?? DatabaseTablesConfig;
    const tables = (effectiveTablesConfig.essentialTables ?? DatabaseTablesConfig.essentialTables).slice(0, 10);
    for (const table of tables) {
      try {
        const result = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
        metrics.rowCounts[table] = parseInt(result[0]?.count || '0');
      } catch (error) {
        // Ignorer
      }
    }
    
    return metrics;
  }

  async refreshSchema(): Promise<void> {
    this.schemaCache.clear();
    this.schemaJsonCache.clear();
    await this.loadDatabaseRelationships();
    this.logger.log('✅ Caches vidés et relations rechargées');
  }

  /**
  * Retourne le schéma complet de la base avec toutes les métadonnées
  * Utilise les tables déjà sélectionnées par detectRelevantTables
  */
  async getFullDatabaseSchema(question?: string, specificTables?: string[]): Promise<any> {
    // Si une question est fournie, utiliser les tables détectées
    let tablesToUse: string[];
    
    if (question) {
      tablesToUse = await this.detectRelevantTables(question, specificTables);
    } else {
      // Sinon, utiliser les tables visibles (cellesfgetTableInfoJson avec métadonnées)
      tablesToUse = this.schemaMetadata.getAllVisibleTables();
    }
    
    this.logger.log(`📊 Génération du schéma JSON pour ${tablesToUse.length} tables`);
    
    const result = {
      database: process.env.DB_NAME,
      generatedAt: new Date().toISOString(),
      tables: {},
      relationships: [] as any[]
    };
    
    const relationships = this.relationshipsCache.get('all') || {};
    
    for (const table of tablesToUse) {
      try {
        const tableSchema = await this.getTableInfoJson(table, relationships[table]);
        if (tableSchema) {
          result.tables[table] = tableSchema;
          
          // Ajouter les relations
          if (relationships[table]?.foreignKeys) {
            for (const fk of relationships[table].foreignKeys) {
              result.relationships.push({
                from: { table, column: fk.column },
                to: { table: fk.referencedTable, column: fk.referencedColumn },
                type: 'belongsTo'
              });
            }
          }
        } else {
          this.logger.warn(`⚠️ Table ${table} ignorée (pas de schéma JSON généré)`);
        }
      } catch (error) {
        this.logger.error(`❌ Erreur génération schéma pour ${table}: ${(error as any).message}`);
      }
    }
    
    this.logger.log(`✅ Schéma JSON généré: ${Object.keys(result.tables).length} tables, ${result.relationships.length} relations`);
    
    return result;
  }


  /**
 * Retourne exactement ce qui est envoyé au prompt de l'IA
 * Utile pour debug et comprendre le contexte
 */
async getPromptSchema(question: string, specificTables?: string[]): Promise<any> {
  const startTime = Date.now();
  
  // Détecter les tables pertinentes
  const relevantTables = await this.detectRelevantTables(question, specificTables);
  
  // Générer le schéma complet (comme envoyé à l'IA)
  const schema = await this.getCompleteSchema(relevantTables);
  
  // Générer le prompt complet qui serait envoyé
  const prompt = this.buildGenericPrompt(question, schema, relevantTables);
  
  // Récupérer les métadonnées enrichies
  const tableMetadata: Array<{
    table: string;
    businessName: string;
    description: string;
    icon?: string;
    category?: string;
  }> = [];
  for (const table of relevantTables) {
    const meta = this.schemaMetadata.getTableMetadataForPrompt(table);
    if (meta) {
      tableMetadata.push({
        table,
        businessName: meta.label,
        description: meta.description,
        icon: meta.icon,
        category: meta.category
      });
    }
  }
  
  return {
    question,
    relevantTables,
    schemaPreview: schema.substring(0, 2000) + (schema.length > 2000 ? '\n... (tronqué)' : ''),
    schemaLength: schema.length,
    fullPrompt: prompt,
    promptLength: prompt.length,
    tableMetadata,
    executionTimeMs: Date.now() - startTime,
    // Version complète du schéma (optionnel, pour download)
    fullSchema: schema,
    // Relations entre tables
    relations: this.relationshipsCache.get('all') || {}
  };
}
}
