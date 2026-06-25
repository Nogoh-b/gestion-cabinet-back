import {
  Controller, Post, Get, Body, HttpCode, HttpStatus,
  Query, UseGuards, Req, UnauthorizedException, NotFoundException, Param,
  Logger, UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto, WritePlan } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ConversationManagerService } from './conversation-manager.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TenantContext, getCurrentTenantId } from '../tenant/tenant.context';

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
  ) {}
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AiQuotaGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), // Garder en mémoire pour traitement immédiat
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
      const allowed = ['application/pdf', 'text/csv', 'text/plain', 'text/html', 'application/json',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
      }
    }
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        conversationId: { type: 'string' },
        documentIds: { type: 'string', description: 'JSON array ou liste separee par virgules' },
        intentMode: { type: 'string', enum: ['auto', 'read', 'write', 'chat'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async askQuestion(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<AnalysisResponseDto> {
    return this.aiDbService.analyzeQuestion(dto, user, file);
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
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = [
        'application/pdf', 'text/csv', 'text/plain', 'text/html', 'application/json',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      cb(allowed.includes(file.mimetype) ? null : new Error(`Type non supporté: ${file.mimetype}`), allowed.includes(file.mimetype));
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Version streaming (SSE) de /ask' })
  async askStream(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ): Promise<void> {
    const t0 = Date.now();
    this.logger.log(`🕐 [SSE] askStream ENTRÉ à ${new Date().toISOString()}`);

    // ── Headers SSE — envoyés AVANT tout proxy ────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');   // désactive le buffer nginx
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();                          // flush immédiat vers le client

    let tokenEmitCount = 0;
    const sendEvent = (event: string, data: any) => {
      if (res.writableEnded) return;             // connexion déjà fermée

      if (event === 'token') {
        tokenEmitCount++;
        if (tokenEmitCount <= 3 || tokenEmitCount % 20 === 0) {
          this.logger.debug(`📤 SSE → [token #${tokenEmitCount}] "${(data?.text ?? '').toString().substring(0, 30)}"`);
        }
      } else {
        this.logger.debug(`📤 SSE → [${event}] ${JSON.stringify(data).substring(0, 100)}`);
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
      await this.tenantContext.run(tenantId, () =>
        this.aiDbService.analyzeQuestionStream(dto, user, file, sendEvent),
      );
    } catch (err) {
      sendEvent('error', { message: err?.message ?? String(err) });
    } finally {
      this.logger.debug(`📤 SSE → [done] (${tokenEmitCount} tokens, +${Date.now() - t0}ms)`);
      sendEvent('done', {});
      res.end();
    }
  }

  // ── Confirmation write ───────────────────────────────────────────────────────

  @Post('write/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirme une opération d\'écriture' })
  async confirmWrite(
    @Body('pendingIntent') pendingIntent: WritePlan,
    @CurrentUser() user
  ): Promise<AnalysisResponseDto> {
    return this.aiDbService.confirmWrite(pendingIntent, user);
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
  @ApiOperation({ summary: 'Reprend un plan d\'écriture après résolution d\'ambiguïté' })
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
  @ApiOperation({ summary: 'Vérifie l\'état de l\'agent IA' })
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      agentReady: true
    };
  }

  @Get('schema-json')
  @ApiOperation({ 
    summary: 'Récupère le schéma complet de la base de données avec métadonnées métier',
    description: 'Retourne la structure de toutes les tables avec libellés, descriptions, types, relations...'
  })
  @ApiResponse({ status: 200, description: 'Schéma retourné avec succès' })
  async getDatabaseSchemaJSON() {
    return this.aiDbService.getFullDatabaseSchema();
  }
  @Get('schema')
  @ApiOperation({ 
    summary: 'Récupère le schéma complet de la base de données avec métadonnées métier',
    description: 'Retourne la structure de toutes les tables avec libellés, descriptions, types, relations...'
  })
  @ApiResponse({ status: 200, description: 'Schéma retourné avec succès' })
  async getDatabaseSchema() {
        // const allTables = this.schemaMetadata.getAllVisibleTables();
    // const schemaJSON = await this.aiDbService.getCompleteSchemaJson(allTables);
    return await this.aiDbService.preloadSystemPrompt();
  }

   @Post('analyze')
  async analyze(@Body() dto: AskQuestionDto, @Req() req) {
    const userId = req.user?.id || 'anonymous'; // Ton système d'auth
    return this.aiDbService.analyzeQuestion(dto, userId);
  }
  
  @Get('conversations')
  async getConversations(@Req() req) {
    const userId = req.user?.id || 'anonymous';
    return this.conversationManager.getUserConversations(userId);
  } 

  @Post('conversations')
  async createConversation(@Req() req) {
    const userId = req.user?.id || 'anonymous';
    return this.conversationManager.createConversation(userId);
  }
  
  @Get('conversations/:id/messages')
  async getConversationMessages(@Param('id') conversationId: string, @Req() req) {
    const userId = req.user?.id || 'anonymous';

    // Cherche la conversation sans filtre de statut pour distinguer 404 vs 403
    const conversation = await this.conversationManager.getConversationAny(conversationId);

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} introuvable`);
    }

    // Si la conversation était créée en mode anonyme et que l'utilisateur est maintenant authentifié,
    // on ré-associe automatiquement la conversation à l'utilisateur connecté.
    if (conversation.userId === 'anonymous' && userId !== 'anonymous') {
      await this.conversationManager.reassignConversation(conversationId, String(userId));
    } else if (conversation.userId.toString() !== userId.toString()) {
      this.logger.warn(
        `⚠️ Accès refusé à la conversation ${conversationId}: ` +
        `owner=${conversation.userId}, requester=${userId}`
      );
      throw new UnauthorizedException('Cette conversation ne vous appartient pas.');
    }

    return this.conversationManager.getFullHistory(conversationId);
  }


  @Get('prompt-schema')
  @ApiOperation({ 
    summary: 'Récupère le schéma envoyé à l\'IA pour une question donnée',
    description: 'Visualise exactement ce que l\'IA reçoit comme contexte'
  })
  async getPromptSchema(@Query('question') question: string, @Query('tables') tables?: string) {
    const specificTables = tables ? tables.split(',') : undefined;
    return this.aiDbService.getPromptSchema(question, specificTables);
  }

  @Get('visible-tables')
  @ApiOperation({ summary: 'Liste les tables visibles (avec métadonnées)' })
  async getVisibleTables() {
    const tables = this.schemaMetadata.getAllVisibleTables()
    return {
      count: this.schemaMetadata.getVisibleTablesCount(),
      tables,
      schemaJSON: await this.aiDbService.getCompleteSchemaJson(tables),
      details: this.schemaMetadata.getAllVisibleTables().map(table => ({
        name: table,
        metadata: this.schemaMetadata.getTableMetadataForPrompt(table)
      }))
    };
  }
}
