// src/modules/audiences/audience-decision.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Audience, AudienceStatus } from './entities/audience.entity';
import { DecisionAudienceDto, AddDecisionResponseDto } from './dto/decision-audience.dto';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AudienceDecisionService {
  constructor(
    @InjectRepository(Audience)
    private readonly audienceRepository: Repository<Audience>,
    private readonly documentCustomerService: DocumentCustomerService,
    private readonly dossierService: DossiersService,
  ) {}

  /**
   * Ajouter une décision à une audience
   */
  async addDecision(
    audienceId: number,
    decisionDto: DecisionAudienceDto,
    entityManager?: EntityManager,
  ): Promise<AddDecisionResponseDto> {
    const repo = entityManager 
      ? entityManager.getRepository(Audience) 
      : this.audienceRepository;

    const audience = await repo.findOne({
      where: { id: audienceId },
      relations: ['dossier', 'decision_documents'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${audienceId} non trouvée`);
    }

    // Vérifier que l'audience a bien eu lieu
    if (audience.status !== AudienceStatus.HELD) {
      throw new BadRequestException(
        `Impossible d'ajouter une décision car l'audience n'est pas encore tenue. Statut actuel: ${audience.status}`
      );
    }

    // Mettre à jour les champs de décision
    audience.decision_text = decisionDto.decision;
    audience.decision_outcome = decisionDto.outcome || audience.outcome;
    audience.decision_date = decisionDto.decision_date || new Date();
    audience.decision_notes = decisionDto.notes || '';

    // Gérer les documents de décision
    if (decisionDto.document_decision_ids && decisionDto.document_decision_ids.length > 0) {
      const documents = await this.documentCustomerService.findByIds(
        decisionDto.document_decision_ids
      );
      audience.decision_documents = documents;
      console.log(documents.map(doc => doc.id) ,  ' ', decisionDto.document_decision_ids );
    }

    // Mettre à jour le statut de l'audience si nécessaire
    audience.status = AudienceStatus.HELD;
    if (decisionDto.outcome) {
      audience.outcome = decisionDto.outcome;
    }

    const savedAudience = await repo.save(audience);

    // Mettre à jour le dossier en fonction de la décision
    await this.updateDossierBasedOnDecision(savedAudience);

    return plainToInstance(AddDecisionResponseDto, {
      id: savedAudience.id,
      decision: savedAudience.decision_text,
      outcome: savedAudience.decision_outcome,
      decision_date: savedAudience.decision_date,
      documents: savedAudience.decision_documents,
    });
  }

  /**
   * Mettre à jour le dossier en fonction de la décision
   */
  private async updateDossierBasedOnDecision(audience: Audience): Promise<void> {
    const dossier = audience.dossier;
    if (!dossier) return;

    // Logique basée sur l'issue de la décision
    // switch (audience.decision_outcome) {
    //   case 'favorable':
    //     // Décision favorable au client
    //     if (dossier.status === DossierStatus.LITIGATION) {
    //       await this.dossierService.updateStatus(
    //         dossier.id,
    //         DossierStatus.CLOSED_FAVORABLE
    //       );
    //     }
    //     break;

    //   case 'unfavorable':
    //     // Décision défavorable - possibilité d'appel
    //     if (dossier.status === DossierStatus.LITIGATION) {
    //       // Vérifier les délais d'appel
    //       const decisionDate = audience.decision_date;
    //       const today = new Date();
    //       const daysSinceDecision = Math.floor(
    //         (today.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24)
    //       );

    //       if (daysSinceDecision <= 30) {
    //         // Dans les délais d'appel
    //         await this.dossierService.updateStatus(
    //           dossier.id,
    //           DossierStatus.APPEAL_POSSIBLE
    //         );
    //       } else {
    //         await this.dossierService.updateStatus(
    //           dossier.id,
    //           DossierStatus.CLOSED_UNFAVORABLE
    //         );
    //       }
    //     }
    //     break;

    //   case 'partial':
    //     // Décision partiellement favorable
    //     if (dossier.status === DossierStatus.LITIGATION) {
    //       await this.dossierService.updateStatus(
    //         dossier.id,
    //         DossierStatus.PARTIAL_FAVORABLE
    //       );
    //     }
    //     break;

    //   default:
    //     // Aucun changement automatique
    //     break;
    // }
  }

  /**
   * Modifier une décision existante
   */
  async updateDecision(
    audienceId: number,
    decisionDto: DecisionAudienceDto,
  ): Promise<AddDecisionResponseDto> {
    const audience = await this.audienceRepository.findOne({
      where: { id: audienceId },
      relations: ['decision_documents', 'dossier'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${audienceId} non trouvée`);
    }

    // Mise à jour des champs
    if (decisionDto.decision) {
      audience.decision_text = decisionDto.decision;
    }
    if (decisionDto.outcome) {
      audience.decision_outcome = decisionDto.outcome;
      audience.outcome = decisionDto.outcome;
    }
    if (decisionDto.decision_date) {
      audience.decision_date = decisionDto.decision_date;
    }
    if (decisionDto.notes) {
      audience.decision_notes = decisionDto.notes;
    }

    // Gérer l'ajout de nouveaux documents
    if (decisionDto.document_decision_ids && decisionDto.document_decision_ids.length > 0) {
      const newDocuments = await this.documentCustomerService.findByIds(
        decisionDto.document_decision_ids
      );
      audience.decision_documents = [
        ...(audience.decision_documents || []),
        ...newDocuments,
      ];
    }

    const savedAudience = await this.audienceRepository.save(audience);

    return plainToInstance(AddDecisionResponseDto, {
      id: savedAudience.id,
      decision: savedAudience.decision_text,
      outcome: savedAudience.decision_outcome,
      decision_date: savedAudience.decision_date,
      documents: savedAudience.decision_documents,
    });
  }

  /**
   * Récupérer la décision d'une audience
   */
  async getDecision(audienceId: number): Promise<any> {
    const audience = await this.audienceRepository.findOne({
      where: { id: audienceId },
      relations: ['decision_documents', 'decision_documents.document_type', 'dossier'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${audienceId} non trouvée`);
    }

    return {
      id: audience.id,
      decision_text: audience.decision_text,
      decision_outcome: audience.decision_outcome,
      decision_date: audience.decision_date,
      decision_notes: audience.decision_notes,
      documents: audience.decision_documents,
      dossier: audience.dossier,
      audience_date: audience.audience_date,
      status: audience.status,
    };
  }

  /**
   * Supprimer un document de la décision
   */
  async removeDecisionDocument(
    audienceId: number,
    documentId: number,
  ): Promise<void> {
    const audience = await this.audienceRepository.findOne({
      where: { id: audienceId },
      relations: ['decision_documents'],
    });

    if (!audience) {
      throw new NotFoundException(`Audience avec ID ${audienceId} non trouvée`);
    }

    audience.decision_documents = audience.decision_documents.filter(
      (doc) => doc.id !== documentId
    );

    await this.audienceRepository.save(audience);
  }
}