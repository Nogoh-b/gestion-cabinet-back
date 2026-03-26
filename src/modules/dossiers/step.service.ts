// services/steps.service.ts
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';



import { InjectRepository } from '@nestjs/typeorm';



import { Dossier } from '../dossiers/entities/dossier.entity';
import { User } from '../iam/user/entities/user.entity';
import { UsersService } from '../iam/user/user.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { AudiencesService } from '../audiences/audiences.service';
import { Step, StepStatus, StepType } from './entities/step.entity';
import { CreateStepDto } from './dto/create-step.dto';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DiligencesService } from '../diligence/diligence.service';
import { DocumentCustomer, DocumentCustomerStatus } from '../documents/document-customer/entities/document-customer.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { AudienceStatus } from '../audiences/entities/audience.entity';
import { DiligenceStatus } from '../diligence/entities/diligence.entity';
import { FactureService } from '../facture/facture.service';







@Injectable()
export class StepsService extends BaseServiceV1<Step> {
  constructor(
    @InjectRepository(Step)
    private stepsRepository: Repository<Step>,
    @InjectRepository(Dossier)
    private dossierRepository: Repository<Dossier>,
    private dossierService: DossiersService,
    private factureService: FactureService,
    private documentService: DocumentCustomerService,
    private audiencesService: AudiencesService,
    private diligencesService: DiligencesService,
    private usersService: UsersService,
    protected readonly paginationService: PaginationServiceV1,

  ) {
    super(stepsRepository, paginationService);

  }


  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [],
      exactMatchFields: [],
      dateRangeFields: [],
      relationFields: ['actions', 'documents', 'diligences', 'audiences', 'factures', 'diligences.documents', 'audiences.documents'],
    };
  }

   // Nouvelle méthode pour créer une étape personnalisée
  async createStep(dossierId: number, createStepDto: CreateStepDto): Promise<Step> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId }
    });

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé '+ dossierId);
    }

    let assignedTo : User| null = null;
    if (createStepDto.assignedToId) {
      assignedTo = plainToInstance(User,await this.usersService.findOne(parseInt(createStepDto.assignedToId)));
    }

    const step = this.stepsRepository.create({
      ...createStepDto,
      dossier,
      assignedTo
    });

    return this.stepsRepository.save(step);
  }

  // Dans steps.service.ts

  /**
  * Créer une étape directement à partir d'une entité Step
  */
  async createStepFromEntityVO(dossierId: number, stepEntity: Partial<Step>): Promise<Step> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId }
    });

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé ' + dossierId);
    }
    
    const step = this.stepsRepository.create({
      ...stepEntity,
      dossier
    });
    console.log('creation du step : ' , stepEntity.dossier?.id)


    return this.stepsRepository.save(stepEntity);
  }

  async createStepFromEntity(dossierId: number, stepEntity: Partial<Step>): Promise<Step> {
  const step = this.stepsRepository.create({
    ...stepEntity,
    dossier: { id: dossierId } as Dossier   // fake entity juste pour la relation
  });

  return this.stepsRepository.save(step);
}

  // Méthode pour récupérer l'étape courante
  async getCurrentStep(dossierId: number): Promise<any> {
    const step = await this.stepsRepository.findOne({
      where: { 
        dossier: { id: dossierId },
        status: StepStatus.IN_PROGRESS
      },
      relations: this.getDefaultSearchOptions().relationFields
    });
    console.log(step)

    if (!step) {
      // throw new NotFoundException('Aucune étape en cours pour ce dossier');
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
      console.log('Pas d\'appel trouvé sur ce dossier ', dossierId)

      // Créer l'étape de recours si elle n'existe pas
      const dossier = await this.dossierRepository.findOne({
        where: { id: dossierId }
      });
      if(!dossier)
        throw new NotFoundException('Dossier inexistant');
      

      appealStep = this.stepsRepository.create({
        type: StepType.APPEAL,
        title : 'Pourvoi en cassation',
        description : 'Cassation engagée devant la Cour de cassation',
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
      relations: this.getDefaultSearchOptions().relationFields,
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







  /**
   * Synchronise une action avec son étape
   */
  async syncActionWithStep(
    actionType: 'diligence' | 'audience' | 'facture' | 'document',
    actionId: any,
    stepId: number,
  ): Promise<void> {
    switch (actionType) {
      case 'diligence':
        await this.diligencesService.update(actionId, { step_id: stepId } as any);
        break;
      case 'audience':
        await this.diligencesService.update(actionId, { step_id: stepId } as any);
        break;
      case 'facture':
        await this.factureService.updateV1(actionId, { step_id: stepId } as any);
        break;
      case 'document':
        await this.linkDocumentToStep(actionId, stepId);
        break;
    }
    
    // Mettre à jour les métriques de l'étape
    await this.updateStepMetrics(stepId);
  }

  /**
   * Met à jour les métriques d'une étape
   */
  async updateStepMetrics(stepId: number): Promise<void> {
    const step = await this.findOneV1(stepId);

    console.log(step?.documents)

    if (!step) return;

    const metrics = {
      // Documents
      totalDocuments: step.documents?.length || 0,
      validatedDocuments: step.documents?.filter(d => d.status === DocumentCustomerStatus.ACCEPTED).length || 0,
      
      // Diligences
      totalDiligences: step.diligences?.length || 0,
      completedDiligences: step.diligences?.filter(d => d.status === DiligenceStatus.COMPLETED).length || 0,
      
      // Audiences
      totalAudiences: step.audiences?.length || 0,
      heldAudiences: step.audiences?.filter(a => a.status === AudienceStatus.HELD).length || 0,
      
      // Factures
      totalFactures: step.factures?.length || 0,
      paidFactures: step.factures?.filter(f => f.statut_paiement === StatutFacture.PAYEE).length || 0,
      totalAmount: step.factures?.reduce((sum, f) => sum + Number(f.montantTTC), 0) || 0,
    };

    step.metrics = metrics;
    await this.stepsRepository.save(step);
  }

  /**
   * Génère les actions suggérées pour une étape
   */
  async generateSuggestedActions(stepType: StepType, dossierId: number): Promise<any[]> {
    const suggestions: any = [];
    
    switch (stepType) {
      case StepType.OPENING:
        suggestions.push(
          {
            type: 'document',
            title: 'Convention de mandat',
            description: 'Rédiger et faire signer la convention de mandat',
            tooltip: 'Document obligatoire pour l\'ouverture du dossier'
          },
          {
            type: 'facture',
            title: 'Provision initiale',
            description: 'Émettre la facture de provision',
            tooltip: 'Facturer la provision conformément à la convention'
          }
        );
        break;
        
      case StepType.AMIABLE:
        suggestions.push(
          {
            type: 'diligence',
            title: 'Analyse du dossier',
            description: 'Analyser les pièces et préparer la stratégie',
            tooltip: 'Identifier les points clés et les risques'
          },
          {
            type: 'document',
            title: 'Courrier de mise en demeure',
            description: 'Rédiger et envoyer la mise en demeure',
            tooltip: 'Document officiel pour la phase amiable'
          },
          {
            type: 'audience',
            title: 'Réunion de médiation',
            description: 'Organiser la réunion de médiation',
            tooltip: 'Tenter une résolution à l\'amiable'
          }
        );
        break;
        
      case StepType.CONTENTIOUS:
        suggestions.push(
          {
            type: 'diligence',
            title: 'Préparation de la procédure',
            description: 'Préparer les conclusions et assignations',
            tooltip: 'Rédiger les actes de procédure'
          },
          {
            type: 'document',
            title: 'Assignation',
            description: 'Rédiger et déposer l\'assignation',
            tooltip: 'Acte introductif d\'instance'
          },
          {
            type: 'audience',
            title: 'Audience de plaidoirie',
            description: 'Préparer et assister à l\'audience',
            tooltip: 'Présenter les arguments devant le tribunal'
          }
        );
        break;
        
      // Ajouter les autres cas...
    }
    
    return suggestions;
  }

  /**
   * Vérifie la cohérence entre les actions et leur étape
   */
  async validateStepConsistency(stepId: number): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const step = await this.stepsRepository.findOne({
      where: { id: stepId },
      relations: ['diligences', 'audiences', 'factures', 'documents', 'dossier']
    });

    const errors: any = [];
    const warnings: any = [];

    if (!step) {
      return { isValid: false, errors: ['Step not found'], warnings: [] };
    }

    // Vérifier que toutes les actions appartiennent au même dossier que l'étape
    const allActions = [
      ...(step.diligences || []),
      ...(step.audiences || []),
      ...(step.factures || [])
    ];

    for (const action of allActions) {
      if (action.dossier_id !== step.dossier?.id) {
        errors.push(`Action ${action.id} does not belong to the same dossier as step`);
      }
    }

    // Vérifier que les documents sont liés aux bonnes diligences/audiences
    for (const document of step.documents || []) {
      if (document.dossier_id !== step.dossier?.id) {
        warnings.push(`Document ${document.id} is linked to a different dossier`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async linkDocumentToStep(documentId: number, stepId: number): Promise<void> {
    const document = await this.documentService.findOneV1(documentId);
    const step = await this.findOneV1(stepId);
    
    if (!document || !step) {
      throw new NotFoundException('Document ou étape non trouvé');
    }
    
    // Vérifier si le document a déjà la propriété steps
    if (!document.steps) {
      document.steps = [];
    }
    
    // Éviter les doublons
    if (!document.steps.some(s => s.id === stepId)) {
      document.steps.push(step);
      await this.documentService.createV1(document);
    }
  }

  /**
   * Récupère tous les documents d'une étape avec leur contexte
   */
  async getDocumentsByStep(stepId: number): Promise<{
    stepDocuments: DocumentCustomer[];
    diligenceDocuments: DocumentCustomer[];
    audienceDocuments: DocumentCustomer[];
  }> {
    const step = await this.stepsRepository.findOne({
      where: { id: stepId },
      relations: [
        'documents',
        'diligences',
        'diligences.documents',
        'audiences',
        'audiences.documents'
      ]
    });

    if (!step) {
      throw new Error('Step not found');
    }

    return {
      stepDocuments: step.documents || [],
      diligenceDocuments: step.diligences?.flatMap(d => d.documents || []) || [],
      audienceDocuments: step.audiences?.flatMap(a => a.documents || []) || []
    };
  }

  /**
   * Génère un rapport des documents par étape
   */
  async generateStepDocumentReport(stepId: number): Promise<any> {
    const step = await this.stepsRepository.findOne({
      where: { id: stepId },
      relations: ['documents', 'diligences.documents', 'audiences.documents']
    });

    if (!step) {
      throw new Error('Step not found');
    }

    const allDocuments = [
      ...(step.documents || []),
      ...(step.diligences?.flatMap(d => d.documents || []) || []),
      ...(step.audiences?.flatMap(a => a.documents || []) || [])
    ];

    // Dédupliquer par ID
    const uniqueDocuments = Array.from(
      new Map(allDocuments.map(doc => [doc.id, doc])).values()
    );

    return {
      step: {
        id: step.id,
        title: step.title,
        type: step.type,
        status: step.status
      },
      statistics: {
        total: uniqueDocuments.length,
        byStatus: {
          pending: uniqueDocuments.filter(d => d.status === DocumentCustomerStatus.PENDING).length,
          accepted: uniqueDocuments.filter(d => d.status === DocumentCustomerStatus.ACCEPTED).length,
          refused: uniqueDocuments.filter(d => d.status === DocumentCustomerStatus.REFUSED).length
        },
        byCategory: this.groupDocumentsByCategory(uniqueDocuments),
        totalSize: uniqueDocuments.reduce((sum, d) => sum + (d.file_size || 0), 0)
      },
      documents: uniqueDocuments.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.document_type?.name,
        status: doc.status_label,
        uploadedBy: doc.uploaded_by?.full_name,
        uploadedAt: doc.uploaded_at,
        size: doc.file_size_formatted,
        associations: {
          diligence: doc.diligences?.map(d => d.title),
          audience: doc.audiences?.map(a => `${a.audience_date} - ${a.audience_time}`)
        }
      }))
    };
  }

  private groupDocumentsByCategory(documents: DocumentCustomer[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const doc of documents) {
      const category = doc.category?.name || 'Sans catégorie';
      groups[category] = (groups[category] || 0) + 1;
    }
    return groups;
  }



  async createAmicableStep(dossier: Dossier): Promise<any> {
      // Ne pas instancier Step, passer un objet simple
      const stepData = {
        type: StepType.AMIABLE,
        title: 'Phase transactionnelle',
        description: 'Négociation avec la partie adverse',
        status: StepStatus.IN_PROGRESS,
        metadata: {
          type: 'AMICABLE',
          startDate: new Date(),
          recommendation: dossier.recommendation
        }
      };
      
      console.log('decision du client11 : ', dossier.id);
      
        const step = this.stepsRepository.create({
          ...stepData,
          dossier: { id: dossier.id } as Dossier   // fake entity juste pour la relation
        });

        return this.stepsRepository.save(step);
      
 
  }
  

  

}