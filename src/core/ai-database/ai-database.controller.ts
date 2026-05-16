import {
  Controller, Post, Get, Body, HttpCode, HttpStatus,
  Query, UseGuards, Req, UnauthorizedException, Param,
  Logger, UseInterceptors, UploadedFile, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto, WritePlan } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ConversationManagerService } from './conversation-manager.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

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
  ) {}
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(), // Garder en mémoire pour traitement immédiat
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
      const allowed = ['application/pdf', 'text/csv', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'application/json'];
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
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async askQuestion(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @UploadedFile() file?: Express.Multer.File
  ): Promise<AnalysisResponseDto> {
    return this.aiDbService.analyzeQuestion(dto, user.id, file);
  }


  // ── Streaming SSE ───────────────────────────────────────────────────────────

  /**
   * Version streaming de /ask.
   * Retourne un flux text/event-stream avec les événements :
   *   status        → progression
   *   intent        → type READ/WRITE détecté
   *   confirmation  → plan write à confirmer
   *   ambiguity     → choix nécessaire (candidats multiples)
   *   result        → réponse finale complète
   *   error         → message d'erreur
   *   done          → fin du flux
   */
  @Post('ask/stream')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = [
        'application/pdf', 'text/csv', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'application/json',
      ];
      cb(allowed.includes(file.mimetype) ? null : new Error(`Type non supporté: ${file.mimetype}`), allowed.includes(file.mimetype));
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Version streaming (SSE) de /ask' })
  async askStream(
    @Body() dto: AskQuestionDto,
    @CurrentUser() user,
    @Res() res: Response,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<void> {
    const t0 = Date.now();
    this.logger.log(`🕐 [SSE] askStream ENTRÉ à ${new Date().toISOString()}`);

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // ── Désactiver le cork TCP pour ce socket ───────────────────────────────
    const sock = (res as any).socket;
    if (sock?.writable) {
      sock.setNoDelay(true); // désactive Nagle
      sock.uncork();         // vide le buffer TCP accumulé
    }

    res.flushHeaders(); // Envoie les headers HTTP immédiatement
    this.logger.log(`🕐 [SSE] flushHeaders appelé @ +${Date.now() - t0}ms`);

    // Yield l'event loop une fois pour s'assurer que les headers partent sur le réseau
    // avant de commencer le travail async (appels LLM etc.)
    await new Promise<void>(resolve => setImmediate(resolve));
    this.logger.log(`🕐 [SSE] setImmediate passé (headers réseau) @ +${Date.now() - t0}ms`);

    // Commentaire SSE de "prime" — force le proxy à commencer à streamer
    res.write(': stream-start\n\n');

    const flushAvailable = typeof (res as any).flush === 'function';
    this.logger.debug(`🔌 SSE connect — flush disponible: ${flushAvailable}, socket: ${!!sock}`);

    /**
     * Écrit un event SSE et vide le buffer TCP immédiatement.
     * Le socket est déjà uncork()'d, donc chaque write() part en réseau sans délai.
     */
    const sendEvent = (event: string, data: any) => {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(payload);
      if (flushAvailable) (res as any).flush(); // compression middleware si présent
      // Log chaque event sauf 'token' (trop verbeux)
      if (event !== 'token') {
        this.logger.debug(`📤 SSE → [${event}] ${JSON.stringify(data).substring(0, 100)}`);
      }
    };

    let tokenEmitCount = 0;
    const sendEventWithTokenLog = (event: string, data: any) => {
      if (event === 'token') {
        tokenEmitCount++;
        if (tokenEmitCount <= 3 || tokenEmitCount % 20 === 0) {
          this.logger.debug(`📤 SSE → [token #${tokenEmitCount}] "${(data.text ?? '').substring(0, 30)}"`);
        }
      }
      sendEvent(event, data);
    };

    try {
      await this.aiDbService.analyzeQuestionStream(dto, user.id, file, sendEventWithTokenLog);
    } catch (err) {
      sendEvent('error', { message: err.message });
    } finally {
      this.logger.debug(`📤 SSE → [done] (${tokenEmitCount} tokens émis au total)`);
      res.write('event: done\ndata: {}\n\n');
      if (flushAvailable) (res as any).flush();
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
    return this.aiDbService.confirmWrite(pendingIntent, user.id);
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
      user.id,
      conversationId,
      customValue,
      entity,
    );
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exécute une requête SQL (SELECT uniquement)' })
  async executeCustomQuery(@Body('sql') sqlQuery: string) {
    return this.aiDbService.executeQuery(sqlQuery);
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
    // Vérifier que la conversation appartient à l'utilisateur
    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation || conversation.userId.toString() !== userId.toString()) {
      Logger.warn(`⚠️ Accès non autorisé à la conversation ${conversationId} pour user ${userId} ${conversation?.userId}`);
      throw new UnauthorizedException();
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