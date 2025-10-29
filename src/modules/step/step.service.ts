// services/steps.service.ts
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';



import { InjectRepository } from '@nestjs/typeorm';



import { DossiersService } from '../dossiers/dossiers.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { User } from '../iam/user/entities/user.entity';
import { UsersService } from '../iam/user/user.service';
import { CreateStepDto } from './dto/create-step.dto';
import { Step, StepStatus, StepType } from './entities/step.entity';







@Injectable()
export class StepsService {
  constructor(
    @InjectRepository(Step)
    private stepsRepository: Repository<Step>,
    @InjectRepository(Dossier)
    private dossierRepository: Repository<Dossier>,
    private dossierService: DossiersService,
    private usersService: UsersService,
  ) {}


   // Nouvelle méthode pour créer une étape personnalisée
  async createStep(dossierId: number, createStepDto: CreateStepDto): Promise<Step> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId }
    });

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }

    let assignedTo : User| null = null;
    if (createStepDto.assignedToId) {
      assignedTo = plainToInstance(User,await this.usersService.findOne(dossierId));
    }

    const step = this.stepsRepository.create({
      ...createStepDto,
      dossier,
      assignedTo
    });

    return this.stepsRepository.save(step);
  }

  // Méthode pour récupérer l'étape courante
  async getCurrentStep(dossierId: number): Promise<Step> {
    const step = await this.stepsRepository.findOne({
      where: { 
        dossier: { id: dossierId },
        status: StepStatus.IN_PROGRESS
      },
      relations: ['assignedTo', 'documents']
    });

    if (!step) {
      throw new NotFoundException('Aucune étape en cours pour ce dossier');
    }

    return step;
  }

  // Créer les étapes initiales pour un nouveau dossier
  async createInitialSteps(dossierId: number): Promise<Step[]> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId }
    });

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }

    const initialSteps = [
      {
        type: StepType.OPENING,
        title: 'Ouverture du dossier',
        description: 'Création du dossier et enregistrement initial',
        status: StepStatus.COMPLETED,
        dossier,
        metadata: {}
      },
      {
        type: StepType.AMIABLE,
        title: 'Phase amiable',
        description: 'Tentative de résolution à l\'amiable',
        status: StepStatus.PENDING,
        dossier,
        metadata: {}
      },
      {
        type: StepType.CONTENTIOUS,
        title: 'Phase contentieuse',
        description: 'Procédure judiciaire',
        status: StepStatus.PENDING,
        dossier,
        metadata: {}
      },
      {
        type: StepType.DECISION,
        title: 'Décision de justice',
        description: 'Analyse et notification de la décision',
        status: StepStatus.PENDING,
        dossier,
        metadata: {}
      },
      {
        type: StepType.CLOSURE,
        title: 'Clôture du dossier',
        description: 'Archivage et facturation finale',
        status: StepStatus.PENDING,
        dossier,
        metadata: {}
      }
    ];

    return this.stepsRepository.save(initialSteps);
  }

  // Passer à l'étape suivante
  async moveToNextStep(dossierId: number, currentStepType: StepType): Promise<Step> {
    const steps = await this.stepsRepository.find({
      where: { dossier: { id: dossierId } },
      order: { createdAt: 'ASC' }
    });

    const currentStepIndex = steps.findIndex(step => step.type === currentStepType);
    
    if (currentStepIndex === -1 || currentStepIndex >= steps.length - 1) {
      throw new Error('Impossible de passer à l\'étape suivante');
    }

    // Marquer l'étape courante comme terminée
    const currentStep = steps[currentStepIndex];
    currentStep.status = StepStatus.COMPLETED;
    currentStep.completedDate = new Date();
    await this.stepsRepository.save(currentStep);

    // Activer l'étape suivante
    const nextStep = steps[currentStepIndex + 1];
    nextStep.status = StepStatus.IN_PROGRESS;
    return this.stepsRepository.save(nextStep);
  }

  // Gestion spécifique de la phase amiable
  async handleAmiablePhase(dossierId: number, agreementReached: boolean): Promise<Step> {
    const amiableStep = await this.stepsRepository.findOne({
      where: { 
        dossier: { id: dossierId },
        type: StepType.AMIABLE
      }
    });

    if (!amiableStep) {
      throw new NotFoundException('Étape amiable non trouvée');
    }

    amiableStep.status = StepStatus.COMPLETED;
    amiableStep.completedDate = new Date();
    amiableStep.metadata = {
      ...amiableStep.metadata,
      agreementReached
    };

    await this.stepsRepository.save(amiableStep);

    if (agreementReached) {
      // Si accord trouvé, passer directement à la clôture
      return this.moveToClosure(dossierId);
    } else {
      // Sinon, passer à la phase contentieuse
      return this.moveToNextStep(dossierId, StepType.AMIABLE);
    }
  }

  // Gestion des voies de recours
  async initiateAppeal(dossierId: number, appealType: string): Promise<Step> {
    let appealStep = await this.stepsRepository.findOne({
      where: { 
        dossier: { id: dossierId },
        type: StepType.APPEAL
      }
    });

    if (!appealStep) {
      // Créer l'étape de recours si elle n'existe pas
      const dossier = await this.dossierRepository.findOne({
        where: { id: dossierId }
      });
      if(!dossier)
        throw new NotFoundException('Dossier inexistant');
      

      appealStep = this.stepsRepository.create({
        type: StepType.APPEAL,
        title: 'Voies de recours',
        description: `Recours de type ${appealType}`,
        status: StepStatus.IN_PROGRESS,
        dossier,
        metadata: { appealType }
      });
    } else {
      appealStep.status = StepStatus.IN_PROGRESS;
      appealStep.metadata = { ...appealStep.metadata, appealType };
    }

    return this.stepsRepository.save(appealStep);
  }

  // Clôture directe du dossier
  async moveToClosure(dossierId: number): Promise<Step> {
    const closureStep = await this.stepsRepository.findOne({
      where: { 
        dossier: { id: dossierId },
        type: StepType.CLOSURE
      }
    });

    if (!closureStep) {
      throw new NotFoundException('Étape de clôture non trouvée');
    }

    // Marquer toutes les étapes intermédiaires comme annulées ou complétées
    const steps = await this.stepsRepository.find({
      where: { dossier: { id: dossierId } }
    });

    for (const step of steps) {
      if (step.type !== StepType.CLOSURE && step.status === StepStatus.PENDING) {
        step.status = StepStatus.CANCELLED;
        await this.stepsRepository.save(step);
      }
    }

    closureStep.status = StepStatus.IN_PROGRESS;
    return this.stepsRepository.save(closureStep);
  }

  // Récupérer le workflow complet d'un dossier
  async getDossierWorkflow(dossierId: number): Promise<Step[]> {
    return this.stepsRepository.find({
      where: { dossier: { id: dossierId } },
      relations: ['assignedTo', 'documents'],
      order: { createdAt: 'ASC' }
    });
  }

  // Mettre à jour une étape
  async updateStep(stepId: number, updateData: Partial<Step>): Promise<Step> {
    const step = await this.stepsRepository.findOne({
      where: { id: stepId }
    });

    if (!step) {
      throw new NotFoundException('Étape non trouvée');
    }

    Object.assign(step, updateData);
    return this.stepsRepository.save(step);
  }
}