import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
  NotFoundException,
  Param,
  Logger,
  UseInterceptors,
  UploadedFiles,
  Res,
  Patch,
  Delete,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto, WritePlan } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ConversationManagerService } from './conversation-manager.service';
import { FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { PrepareFormDto } from './dto/prepare-form.dto';
import { memoryStorageOptions } from '../shared/interceptors/upload.interceptor';
import { TenantContext, getCurrentTenantId } from '../tenant/tenant.context';
import { toChatPayload } from './chat-visibility';
import { normalizeConversationTitle } from './conversation-resource';
import { UpdateConversationDto, UpdateMessageStateDto } from './dto/update-conversation.dto';
import { MAX_ANALYZED_FILES, utf8FileName } from './chat-attachments';
import { PlanFieldsService } from './plan-fields.service';
import { AiSkillService } from './skills/ai-skill.service';
import type { AiSkillCatalogItem } from './skills/ai-skill.types';
import { FieldOptionsRequest, FieldOptionsResponse, PlanFieldsResponse } from './dto/plan-fields.dto';

/** `file` (un fichier, historique) ou `files` (plusieurs fichiers lus ensemble). */
const QUESTION_FILES = FileFieldsInterceptor(
  [{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: MAX_ANALYZED_FILES }],
  memoryStorageOptions,
);
type QuestionFiles = { file?: Express.Multer.File[]; files?: Express.Multer.File[] } | undefined;
const questionFiles = (uploaded: QuestionFiles) =>
  [...(uploaded?.file ?? []), ...(uploaded?.files ?? [])]
    .slice(0, MAX_ANALYZED_FILES)
    .map((file) => ({ ...file, originalname: utf8FileName(file.originalname) }));

@ApiTags('AI Database Analysis')
@Controller('api/ai-database')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiDatabaseController {
  private readonly logger = new Logger(AiDatabaseController.name);

  constructor(
    private readonly aiDbService: AiDatabaseService,
    private readonly schemaMetadata: SchemaMetadataService,
    private readonly conversationManager: ConversationManagerService,
    private readonly tenantContext: TenantContext,
    private readonly planFields: PlanFieldsService,
    private readonly skills: AiSkillService,
  ) {}
  @Post('form/prepare')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AiQuotaGuard)
  @UseInterceptors(FilesInterceptor('files', 3, memoryStorageOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Prépare ou explique un formulaire, sans écriture en base' })
  async prepareForm(
    @Body() dto: PrepareFormDto,
    @Req() req,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.aiDbService.prepareForm(dto, files ?? [], req?.aiRequestLogId);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AiQuotaGuard)
  @UseInterceptors(QUESTION_FILES)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        conversationId: { type: 'string' },
        documentIds: {
          type: 'string',
          description: 'JSON array ou liste separee par virgules',
        },
        intentMode: { type: 'string', enum: ['auto', 'read', 'write', 'chat', 'knowledge', 'help', 'advice'] },
        file: { type: 'string', format: 'binary' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async askQuestion(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @Req() req,
    @UploadedFiles() uploaded?: QuestionFiles,
  ): Promise<AnalysisResponseDto> {
    return toChatPayload(
      await this.aiDbService.analyzeQuestion(
        dto,
        user,
        questionFiles(uploaded),
        req?.aiRequestLogId,
      ),
    );
  }

  // ── Streaming SSE ───────────────────────────────────────────────────────────

  /**
   * Version streaming de /ask.
   * Écrit directement dans la réponse HTTP (text/event-stream).
   * Headers anti-buffering nginx envoyés immédiatement via res.flushHeaders().
   *
   * Événements :
   *   status        → progression
   *   intent        → type READ/WRITE détecté
   *   confirmation  → plan write à confirmer
   *   ambiguity     → choix nécessaire (candidats multiples)
   *   result        → réponse finale complète
   *   token         → fragment de texte (streaming LLM)
   *   error         → message d'erreur
   *   done          → fin du flux
   */
  @Post('ask/stream')
  @UseGuards(JwtAuthGuard, AiQuotaGuard)
  @UseInterceptors(QUESTION_FILES)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Version streaming (SSE) de /ask' })
  async askStream(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @UploadedFiles() uploaded: QuestionFiles,
    @Res() res: Response,
  ): Promise<void> {
    const t0 = Date.now();
    this.logger.log(`🕐 [SSE] askStream ENTRÉ à ${new Date().toISOString()}`);

    // ── Headers SSE — envoyés AVANT tout proxy ────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // désactive le buffer nginx
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders(); // flush immédiat vers le client

    let tokenEmitCount = 0;
    const sendEvent = (event: string, rawData: any) => {
      if (res.writableEnded) return; // connexion déjà fermée
      const data =
        event === 'rows' || event === 'result' ? toChatPayload(rawData) : rawData;

      if (event === 'token') {
        tokenEmitCount++;
        if (tokenEmitCount <= 3 || tokenEmitCount % 20 === 0) {
          this.logger.debug(
            `📤 SSE → [token #${tokenEmitCount}] "${(data?.text ?? '').toString().substring(0, 30)}"`,
          );
        }
      } else {
        this.logger.debug(
          `📤 SSE → [${event}] ${JSON.stringify(data).substring(0, 100)}`,
        );
      }

      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // Forcer le flush si compression/passthrough middleware présent
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    // Garantit l'isolation tenant sur TOUTE la durée du streaming SSE.
    // L'interceptor global pose déjà le contexte, mais l'enrobage d'un Observable
    // SSE long ne garantit pas la propagation de l'AsyncLocalStorage à chaque
    // hop async (LLM, file d'attente de tokens…). On ré-ancre donc explicitement
    // le contexte avec le tenant du JWT pour que `getCurrentTenantId()` (utilisé
    // par l'injection SQL tenant et le patch Repository) reste fiable tout du long.
    const tenantId: number = (user?.tenantId as number) ?? getCurrentTenantId();

    try {
      sendEvent('status', { message: 'Connexion IA etablie...' });
      await this.tenantContext.run(tenantId, () =>
        this.aiDbService.analyzeQuestionStream(
          dto,
          user,
          questionFiles(uploaded),
          sendEvent,
          (res.req as any)?.aiRequestLogId,
        ),
      );
    } catch (err) {
      sendEvent('error', { message: err?.message ?? String(err) });
    } finally {
      this.logger.debug(
        `📤 SSE → [done] (${tokenEmitCount} tokens, +${Date.now() - t0}ms)`,
      );
      sendEvent('done', {});
      res.end();
    }
  }

  // ── Confirmation write ───────────────────────────────────────────────────────

  @Post('write/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirme une opération d'écriture" })
  async confirmWrite(
    @Body('pendingIntent') pendingIntent: WritePlan,
    @CurrentUser() user,
  ): Promise<AnalysisResponseDto> {
    return this.aiDbService.confirmWrite(pendingIntent, user);
  }

  /**
   * Compétences du chat (menu « # ») utilisables par l'utilisateur : filtrées
   * par ses droits et le plan du cabinet. N'appelle pas le modèle.
   */
  @Get('skills')
  @ApiOperation({ summary: 'Compétences du chat disponibles pour l’utilisateur' })
  async listSkills(@CurrentUser() user): Promise<AiSkillCatalogItem[]> {
    return this.skills.catalog(user);
  }

  /**
   * Champs d'un plan pour la carte de confirmation : libellés, valeur reconnue
   * et listes de choix (clés étrangères, énumérations). Rien n'est écrit.
   */
  @Post('write/plan-fields')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Décrit les champs modifiables d'un plan d'écriture" })
  async describePlanFields(
    @Body('plan') plan: WritePlan,
    @CurrentUser() user,
  ): Promise<PlanFieldsResponse> {
    return this.planFields.describePlan(user, plan);
  }

  /** Options d'un champ : recherche (`q`) ou liste filtrée (champ dépendant). */
  @Post('write/field-options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Options d'un champ de plan d'écriture" })
  async fieldOptions(
    @Body() request: FieldOptionsRequest,
    @CurrentUser() user,
  ): Promise<FieldOptionsResponse> {
    return this.planFields.fieldOptions(user, request);
  }

  // ── Résolution d'ambiguïté ───────────────────────────────────────────────────

  /**
   * Reprend l'exécution d'un WritePlan après qu'un utilisateur a choisi
   * l'entité parmi des candidats ambigus.
   *
   * Corps attendu — OPTION A (choix d'un candidat) :
   * {
   *   "pendingWritePlan": { ... },          ← plan retourné lors de l'ambiguïté
   *   "operationIndex":  0,                 ← ambiguityContext.operationIndex
   *   "fieldName":       "client",          ← ambiguityContext.fieldName
   *   "resolvedId":      42,                ← ID de l'entité choisie
   *   "conversationId":  "uuid"             ← optionnel, pour l'historique
   * }
   *
   * Corps attendu — OPTION B (« Autre ») :
   * {
   *   "pendingWritePlan": { ... },
   *   "operationIndex":  0,
   *   "fieldName":       "jurisdiction",
   *   "entity":          "jurisdictions",   ← ambiguityContext.entity
   *   "customValue":     "TGI de Lyon",     ← texte libre saisi par l'utilisateur
   *   "conversationId":  "uuid"
   * }
   */
  @Post('write/resolve-ambiguity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reprend un plan d'écriture après résolution d'ambiguïté",
  })
  async resolveAmbiguity(
    @Body('pendingWritePlan') pendingWritePlan: WritePlan,
    @Body('operationIndex') operationIndex: number,
    @Body('fieldName') fieldName: string,
    @Body('resolvedId') resolvedId: string | number,
    @Body('conversationId') conversationId: string,
    @Body('customValue') customValue: string,
    @Body('entity') entity: string,
    @CurrentUser() user,
  ): Promise<AnalysisResponseDto> {
    return this.aiDbService.resumeAfterAmbiguity(
      pendingWritePlan,
      operationIndex,
      fieldName,
      resolvedId,
      user,
      conversationId,
      customValue,
      entity,
    );
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exécute une requête SQL (SELECT uniquement)' })
  async executeCustomQuery(@Body('sql') sqlQuery: string, @CurrentUser() user) {
    return this.aiDbService.executeQuery(sqlQuery, user);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Récupère les métriques de la base' })
  async getMetrics() {
    return this.aiDbService.getDatabaseMetrics();
  }

  @Get('health')
  @ApiOperation({ summary: "Vérifie l'état de l'agent IA" })
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      agentReady: true,
    };
  }

  @Get('schema-json')
  @ApiOperation({
    summary:
      'Récupère le schéma complet de la base de données avec métadonnées métier',
    description:
      'Retourne la structure de toutes les tables avec libellés, descriptions, types, relations...',
  })
  @ApiResponse({ status: 200, description: 'Schéma retourné avec succès' })
  async getDatabaseSchemaJSON() {
    return this.aiDbService.getFullDatabaseSchema();
  }
  @Get('schema')
  @ApiOperation({
    summary:
      'Récupère le schéma complet de la base de données avec métadonnées métier',
    description:
      'Retourne la structure de toutes les tables avec libellés, descriptions, types, relations...',
  })
  @ApiResponse({ status: 200, description: 'Schéma retourné avec succès' })
  async getDatabaseSchema() {
    // const allTables = this.schemaMetadata.getAllVisibleTables();
    // const schemaJSON = await this.aiDbService.getCompleteSchemaJson(allTables);
    return await this.aiDbService.preloadSystemPrompt();
  }

  @Post('analyze')
  @UseGuards(AiQuotaGuard)
  async analyze(@Body() dto: AskQuestionDto, @Req() req) {
    const userId = req.user?.id || 'anonymous'; // Ton système d'auth
    return toChatPayload(
      await this.aiDbService.analyzeQuestion(dto, userId, undefined, req?.aiRequestLogId),
    );
  }

  @Get('conversations')
  async getConversations(
    @Req() req,
    @Query('search') search?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    const userId = req.user?.id || 'anonymous';
    return this.conversationManager.listConversations(String(userId), {
      search,
      resourceType,
      resourceId,
    });
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Renomme et/ou épingle une conversation' })
  async updateConversation(
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationDto,
    @Req() req,
  ) {
    await this.assertOwnConversation(conversationId, req.user?.id);
    if (dto.title !== undefined) {
      const title = normalizeConversationTitle(dto.title);
      if (!title) throw new BadRequestException('Le titre ne peut pas être vide.');
      await this.conversationManager.renameConversation(conversationId, title);
    }
    if (dto.pinned !== undefined) {
      await this.conversationManager.setPinned(conversationId, dto.pinned);
    }
    return this.conversationManager.getConversationAny(conversationId);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Supprime une conversation (restaurable)' })
  async deleteConversation(@Param('id') conversationId: string, @Req() req) {
    await this.assertOwnConversation(conversationId, req.user?.id);
    await this.conversationManager.softDeleteConversation(conversationId);
    return { id: conversationId, deleted: true };
  }

  @Post('conversations/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaure une conversation supprimée' })
  async restoreConversation(@Param('id') conversationId: string, @Req() req) {
    await this.assertOwnConversation(conversationId, req.user?.id, true);
    await this.conversationManager.restoreConversation(conversationId);
    return this.conversationManager.getConversationAny(conversationId);
  }

  @Patch('conversations/:id/messages/:messageId/state')
  @ApiOperation({ summary: "Garde l'état d'une carte (brouillon modifié, statut envoyé/annulé/classé)" })
  async updateMessageState(
    @Param('id') conversationId: string,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() dto: UpdateMessageStateDto,
    @Req() req,
  ) {
    await this.assertOwnConversation(conversationId, req.user?.id);
    const patch: Record<string, any> = {};
    if (dto.draftState !== undefined) patch.draftState = dto.draftState ? { ...dto.draftState, savedAt: new Date().toISOString() } : null;
    if (dto.cardStatus !== undefined) patch.cardStatus = dto.cardStatus ? { ...dto.cardStatus, at: new Date().toISOString() } : null;
    if (!Object.keys(patch).length) return { id: messageId };
    try {
      const metadata = await this.conversationManager.patchMessageMetadata(conversationId, messageId, req.user?.id, patch);
      if (!metadata) throw new NotFoundException(`Message ${messageId} introuvable`);
      // Document rédigé corrigé dans sa carte : les questions suivantes relisent la version corrigée.
      const draftText = dto.draftState ? draftStateText(dto.draftState) : null;
      if (draftText) await this.conversationManager.updateGeneratedDocument(conversationId, messageId, draftText.text, draftText.html);
      return { id: messageId, draftState: metadata.draftState ?? null, cardStatus: metadata.cardStatus ?? null };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get('conversations/:id/documents')
  @ApiOperation({ summary: 'Documents de la conversation (pièces lues, documents rédigés), pour le lecteur du chat' })
  async getConversationDocuments(@Param('id') conversationId: string, @Req() req) {
    await this.assertOwnConversation(conversationId, req.user?.id);
    const documents = await this.conversationManager.getConversationDocuments(conversationId, req.user?.id);
    return documents.map((document) => ({
      id: document.id,
      messageId: document.messageId,
      origin: document.origin ?? 'upload',
      name: document.name,
      type: document.type,
      method: document.method,
      confidence: document.confidence,
      pages: document.pages,
      illegible: document.illegible,
      // Le lecteur du chat affiche au plus 60 000 caractères.
      content: (document.displayContent || document.content || '').slice(0, 60_000),
    }));
  }

  /** La conversation existe et appartient à l'utilisateur connecté. */
  private async assertOwnConversation(
    conversationId: string,
    rawUserId: unknown,
    withDeleted = false,
  ) {
    const userId = String(rawUserId ?? 'anonymous');
    const conversation = await this.conversationManager.getConversationAny(
      conversationId,
      { withDeleted },
    );
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} introuvable`);
    }
    if (String(conversation.userId) !== userId) {
      throw new UnauthorizedException('Cette conversation ne vous appartient pas.');
    }
    return conversation;
  }

  @Post('conversations')
  async createConversation(@Req() req) {
    const userId = req.user?.id || 'anonymous';
    return this.conversationManager.createConversation(userId);
  }

  @Get('conversations/:id/messages')
  async getConversationMessages(
    @Param('id') conversationId: string,
    @Req() req,
  ) {
    const userId = req.user?.id || 'anonymous';

    // Cherche la conversation sans filtre de statut pour distinguer 404 vs 403
    const conversation =
      await this.conversationManager.getConversationAny(conversationId);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} introuvable`);
    }

    // Si la conversation était créée en mode anonyme et que l'utilisateur est maintenant authentifié,
    // on ré-associe automatiquement la conversation à l'utilisateur connecté.
    if (conversation.userId === 'anonymous' && userId !== 'anonymous') {
      await this.conversationManager.reassignConversation(
        conversationId,
        String(userId),
      );
    } else if (conversation.userId.toString() !== userId.toString()) {
      this.logger.warn(
        `⚠️ Accès refusé à la conversation ${conversationId}: ` +
          `owner=${conversation.userId}, requester=${userId}`,
      );
      throw new UnauthorizedException(
        'Cette conversation ne vous appartient pas.',
      );
    }

    const history = await this.conversationManager.getFullHistory(conversationId);
    return history.map((message) => toChatPayload(message));
  }

  @Get('prompt-schema')
  @ApiOperation({
    summary: "Récupère le schéma envoyé à l'IA pour une question donnée",
    description: "Visualise exactement ce que l'IA reçoit comme contexte",
  })
  async getPromptSchema(
    @Query('question') question: string,
    @Query('tables') tables?: string,
  ) {
    const specificTables = tables ? tables.split(',') : undefined;
    return this.aiDbService.getPromptSchema(question, specificTables);
  }

  @Get('visible-tables')
  @ApiOperation({ summary: 'Liste les tables visibles (avec métadonnées)' })
  async getVisibleTables() {
    const tables = this.schemaMetadata.getAllVisibleTables();
    return {
      count: this.schemaMetadata.getVisibleTablesCount(),
      tables,
      schemaJSON: await this.aiDbService.getCompleteSchemaJson(tables),
      details: this.schemaMetadata.getAllVisibleTables().map((table) => ({
        name: table,
        metadata: this.schemaMetadata.getTableMetadataForPrompt(table),
      })),
    };
  }
}

/** Texte d'un brouillon modifié dans sa carte (document, courrier, e-mail, WhatsApp). */
function draftStateText(state: Record<string, any>): { text: string; html?: string } | null {
  const plain = (value: unknown) => String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (typeof state.html === 'string' && state.html.trim()) return { text: plain(state.html), html: state.html };
  if (state.values && typeof state.values === 'object') {
    const text = Object.values(state.values).filter((value) => typeof value === 'string' && value.trim()).map(plain).join('\n\n');
    return text ? { text } : null;
  }
  if (typeof state.body === 'string' && state.body.trim()) {
    return { text: `${state.subject ? `Objet : ${state.subject}\n\n` : ''}${plain(state.body)}` };
  }
  if (typeof state.text === 'string' && state.text.trim()) return { text: state.text };
  return null;
}
