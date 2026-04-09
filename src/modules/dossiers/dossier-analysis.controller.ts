// src/modules/dossiers/controllers/dossier-analysis.controller.ts
import { Controller, Post, Body, Param } from '@nestjs/common';
import { DossierAnalysisService } from './dossier-analysis.service';
import { DangerLevel } from './entities/dossier.entity';
import { ClientDecision } from 'src/core/enums/dossier-status.enum';

@Controller('dossiers/:dossierId/analysis')
export class DossierAnalysisController {
  constructor(private readonly analysisService: DossierAnalysisService) {}

  @Post('preliminary')
  async analyze(
    @Param('dossierId') dossierId: number,
    @Body() body: {
      successProbability: number;
      dangerLevel: DangerLevel;
      notes: string;
    },
  ) {
    return this.analysisService.analyzeDossier(
      dossierId,
      body.successProbability,
      body.dangerLevel,
      body.notes,
    );
  }

  @Post('client-decision')
  async clientDecision(
    @Param('dossierId') dossierId: number,
    @Body() body: { decision: ClientDecision },
  ) {
    return this.analysisService.processClientDecision(dossierId, body.decision);
  }

  @Post('judgment')
  async registerJudgment(
    @Param('dossierId') dossierId: number,
    @Body() body: {
      decision: string;
      isSatisfied: boolean;
    },
  ) {
    return this.analysisService.registerJudgment(
      dossierId,
      body.decision,
      body.isSatisfied,
    );
  }
}