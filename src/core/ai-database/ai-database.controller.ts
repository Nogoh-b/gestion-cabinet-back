import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiDatabaseService } from './ai-database.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';

@ApiTags('AI Database Analysis')
@Controller('api/ai-database')
@ApiBearerAuth()
export class AiDatabaseController {
  constructor(private readonly aiDbService: AiDatabaseService) {}

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
}