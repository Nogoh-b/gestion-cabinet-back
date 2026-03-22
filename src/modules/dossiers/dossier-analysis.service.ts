// src/modules/dossiers/services/dossier-analysis.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dossier, DangerLevel } from './entities/dossier.entity';
import { Step, StepType, StepStatus } from 'src/modules/step/entities/step.entity';
import { ClientDecision, RecommendationType } from 'src/core/enums/dossier-status.enum';

@Injectable()
export class DossierAnalysisService {
  constructor(
    @InjectRepository(Dossier)
    private dossierRepository: Repository<Dossier>,
    @InjectRepository(Step)
    private stepRepository: Repository<Step>,
  ) {}

  /**
   * Effectue l'analyse préliminaire d'un dossier
   */
  async analyzeDossier(
    dossierId: number,
    successProbability: number,
    dangerLevel: DangerLevel,
    notes: string,
  ): Promise<Dossier> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId },
      relations: ['steps'],
    });

    if (!dossier) {
      throw new Error('Dossier non trouvé');
    }

    // Effectuer l'analyse
    dossier.performPreliminaryAnalysis(successProbability, dangerLevel, notes);
    
    // Créer les étapes correspondantes
    await this.createStepsFromAnalysis(dossier);
    
    return this.dossierRepository.save(dossier);
  }

  /**
   * Crée automatiquement les étapes basées sur l'analyse
   */
  private async createStepsFromAnalysis(dossier: Dossier): Promise<void> {
    const steps: Partial<Step>[] = [];

    // Étape d'analyse (déjà en cours)
    steps.push({
      type: StepType.OPENING,
      title: 'Analyse préliminaire',
      description: dossier.analysis_notes,
      status: StepStatus.COMPLETED,
      completedDate: new Date(),
      dossier,
      metadata: {
        successProbability: dossier.success_probability,
        dangerLevel: dossier.danger_level,
        recommendation: dossier.recommendation,
      },
    });

    // Selon la recommandation, créer les étapes futures
    if (dossier.recommendation === RecommendationType.PRESENT_OPTIONS) {
      steps.push({
        type: StepType.AMIABLE,
        title: 'Présentation des options au client',
        description: 'Présenter les options de transaction et contentieux au client',
        status: StepStatus.PENDING,
        scheduledDate: new Date(),
        dossier,
      });
    }

    await this.stepRepository.save(steps);
  }

  /**
   * Valide la décision du client et crée les étapes correspondantes
   */
  async processClientDecision(
    dossierId: number,
    decision: ClientDecision,
  ): Promise<Dossier> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId },
      relations: ['steps'],
    });

    if (!dossier) {
      throw new Error('Dossier non trouvé');
    }

    dossier.chooseClientDecision(decision);

    // Créer les étapes selon la décision
    const steps: Partial<Step>[] = [];

    if (decision === ClientDecision.TRANSACTION) {
      steps.push({
        type: StepType.AMIABLE,
        title: 'Phase de négociation transactionnelle',
        description: 'Négociation avec la partie adverse pour trouver un accord amiable',
        status: StepStatus.IN_PROGRESS,
        dossier,
      });
    } else if (decision === ClientDecision.CONTENTIEUX) {
      steps.push({
        type: StepType.CONTENTIOUS,
        title: 'Assignation',
        description: 'Préparation et dépôt de l\'assignation',
        status: StepStatus.IN_PROGRESS,
        dossier,
      });
    }

    await this.stepRepository.save(steps);

    return this.dossierRepository.save(dossier);
  }

  /**
   * Enregistre un jugement et crée les étapes suivantes
   */
  async registerJudgment(
    dossierId: number,
    decision: string,
    isSatisfied: boolean,
  ): Promise<Dossier> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId },
      relations: ['steps'],
    });

    if (!dossier) {
      throw new Error('Dossier non trouvé');
    }

    dossier.registerJudgment(decision, isSatisfied);

    // Créer l'étape jugement
    const judgmentStep = this.stepRepository.create({
      type: StepType.DECISION,
      title: 'Jugement',
      description: `Décision: ${decision}`,
      status: StepStatus.COMPLETED,
      completedDate: new Date(),
      dossier,
      metadata: { decision, isSatisfied },
    });

    await this.stepRepository.save(judgmentStep);

    // Si le client est insatisfait, créer l'étape d'appel potentiel
    if (!isSatisfied && dossier.appeal_possibility) {
      const appealStep = this.stepRepository.create({
        type: StepType.APPEAL,
        title: 'Possibilité d\'appel',
        description: `Délai pour faire appel: ${dossier.appeal_deadline}`,
        status: StepStatus.PENDING,
        scheduledDate: dossier.appeal_deadline,
        dossier,
      });
      await this.stepRepository.save(appealStep);
    }

    return this.dossierRepository.save(dossier);
  }
}