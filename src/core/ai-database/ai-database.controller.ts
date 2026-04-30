import { Controller, Post, Get, Body, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';

@ApiTags('AI Database Analysis')
@Controller('api/ai-database')
@ApiBearerAuth()
export class AiDatabaseController {
  constructor(
    private readonly aiDbService: AiDatabaseService,
    private readonly schemaMetadata: SchemaMetadataService,
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
  async askQuestion(@Body() dto: AskQuestionDto): Promise<AnalysisResponseDto> {
    return this.aiDbService.analyzeQuestion(dto);
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

  @Get('schema')
  @ApiOperation({ 
    summary: 'Récupère le schéma complet de la base de données avec métadonnées métier',
    description: 'Retourne la structure de toutes les tables avec libellés, descriptions, types, relations...'
  })
  @ApiResponse({ status: 200, description: 'Schéma retourné avec succès' })
  async getDatabaseSchema() {
    return this.aiDbService.getFullDatabaseSchema();
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
    return {
      count: this.schemaMetadata.getVisibleTablesCount(),
      tables: this.schemaMetadata.getAllVisibleTables(),
      details: this.schemaMetadata.getAllVisibleTables().map(table => ({
        name: table,
        metadata: this.schemaMetadata.getTableMetadataForPrompt(table)
      }))
    };
  }
}