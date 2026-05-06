import { Controller, Post, Get, Body, HttpCode, HttpStatus, Query, UseGuards, Req, UnauthorizedException, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ConversationManagerService } from './conversation-manager.service';

@ApiTags('AI Database Analysis')
@Controller('api/ai-database')
  @UseGuards(JwtAuthGuard)

@ApiBearerAuth()
export class AiDatabaseController {
  constructor(
    private readonly aiDbService: AiDatabaseService,
    private readonly schemaMetadata: SchemaMetadataService,
      private readonly conversationManager: ConversationManagerService,

    ) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Pose une question en langage naturel sur votre base de données',
    description: 'L\'IA génère du SQL, exécute la requête et analyse les résultats'
  })
  @ApiResponse({ status: 200, description: 'Analyse réussie', type: AnalysisResponseDto })
  @ApiResponse({ status: 400, description: 'Question invalide' })
  @ApiResponse({ status: 500, description: 'Erreur serveur' })
  @UseGuards(JwtAuthGuard)
  
  async askQuestion(@Body() dto: AskQuestionDto, @CurrentUser() user): Promise<AnalysisResponseDto> {
    dto.conversationId = 'f71158b9-f94a-481b-a634-3e733ab3d147'
    return this.aiDbService.analyzeQuestion(dto, user.id);
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