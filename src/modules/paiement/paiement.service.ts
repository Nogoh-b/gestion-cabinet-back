// src/paiement/paiement.service.ts
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { Facture } from '../facture/entities/facture.entity';
import { CreatePaiementDto, StatutPaiement } from './dto/create-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { Paiement } from './entities/paiement.entity';



@Injectable()
export class PaiementService extends BaseServiceV1<Paiement> {
  constructor(
    @InjectRepository(Paiement)
    protected readonly repository: Repository<Paiement>,
    @InjectRepository(Facture)
    private readonly factureRepository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reference', 'numeroCheque', 'banque', 'titulaire', 'notes'],
      exactMatchFields: ['id', 'factureId', 'mode', 'statut', 'reference'],
      dateRangeFields: ['datePaiement', 'dateValeur', 'created_at', 'updated_at'],
      relationFields: ['facture', 'client', 'dossier']
    };
  }

  async createPaiement(createDto: CreatePaiementDto): Promise<Paiement> {
    // Vérifier que la facture existe
    const facture = await this.factureRepository.findOne({
      where: { id: String(createDto.factureId)  }
    });

    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${createDto.factureId} non trouvée`);
    }

    // Vérifier que le montant ne dépasse pas le reste à payer
    const resteAPayer = Number(facture.montantTTC) - Number(facture.montantPaye);
    if (Number(createDto.montant )> Number(resteAPayer)) {
      throw new BadRequestException(
        `Le montant du paiement (${createDto.montant}) dépasse le reste à payer (${resteAPayer})`
      );
    }

    // Créer le paiement
    const paiement = this.repository.create(createDto);
    const paiementSauvegarde = await this.repository.save(paiement);

    // Mettre à jour la facture
    console.log(createDto.montant)
    facture.ajouterPaiement(createDto.montant);
    await this.factureRepository.save(facture);

    return paiementSauvegarde;
  }

  async updatePaiement(id: string, updateDto: UpdatePaiementDto): Promise<Paiement> {
    const paiement = await this.findOneV1(id, ['facture']);
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouvé`);
    }

    // Si le montant change, mettre à jour la facture
    if (updateDto.montant !== undefined && updateDto.montant !== paiement.montant) {
      const facture = paiement.facture;
      
      // Recalculer le montant payé de la facture
      const ancienMontant = paiement.montant;
      const nouveauMontant = updateDto.montant;
      const difference = nouveauMontant - ancienMontant;

      // Vérifier que le nouveau montant ne dépasse pas le reste à payer + ancien montant
      const resteAPayerAvant = facture.montantTTC - facture.montantPaye;
      if (difference > resteAPayerAvant + ancienMontant) {
        throw new BadRequestException(
          `Le nouveau montant dépasse le montant autorisé`
        );
      }

      // Mettre à jour la facture
      facture.montantPaye += difference;
      facture.calculerResteAPayer();
      await this.factureRepository.save(facture);
    }

    Object.assign(paiement, updateDto);
    return this.repository.save(paiement);
  }

  async searchPaiements(searchDto: SearchPaiementDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };
    
    // Gestion des ranges de montants
    if (searchDto.montant_min !== undefined || searchDto.montant_max !== undefined) {
      criteria.montant = [
        searchDto.montant_min ?? 0,
        searchDto.montant_max ?? Number.MAX_SAFE_INTEGER
      ];
    }

    return this.searchWithTransformer(
      criteria,
      PaiementResponseDto,
      searchDto,
      ['facture'],
      { datePaiement: 'DESC' } as any
    );
  }

  async getPaiementsByFacture(factureId: string): Promise<Paiement[]> {
    return this.findAllV1({ factureId }, undefined, ['facture']);
  }

  async getPaiementsByClient(clientId: string): Promise<Paiement[]> {
    return this.repository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.facture', 'facture')
      .where('facture.clientId = :clientId', { clientId })
      .orderBy('paiement.datePaiement', 'DESC')
      .getMany();
  }

  async validerPaiement(id: string): Promise<Paiement> {
    const paiement = await this.findOneV1(id);
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouvé`);
    }

    paiement.status = StatutPaiement.VALIDE;
    return this.repository.save(paiement);
  }

  async rejeterPaiement(id: string, raison: string): Promise<Paiement> {
    const paiement = await this.findOneV1(id, ['facture']);
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouvé`);
    }

    // Si le paiement était déjà validé, retirer le montant de la facture
    if (paiement.status === StatutPaiement.VALIDE) {
      const facture = paiement.facture;
      facture.montantPaye -= paiement.montant;
      facture.calculerResteAPayer();
      await this.factureRepository.save(facture);
    }

    paiement.status = StatutPaiement.REJETE;
    paiement.notes = raison + (paiement.notes ? `\n${paiement.notes}` : '');
    
    return this.repository.save(paiement);
  }

  async getPaiementsEnAttente(): Promise<Paiement[]> {
    return this.findAllV1({ statut: 'en_attente' }, undefined, ['facture']);
  }

  async getStatistiquesPaiementsParPeriode(dateDebut: Date, dateFin: Date): Promise<any> {
    const result = await this.repository
      .createQueryBuilder('paiement')
      .select('paiement.mode', 'mode')
      .addSelect('COUNT(*)', 'nombre')
      .addSelect('SUM(paiement.montant)', 'montantTotal')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('paiement.statut = :statut', { statut: 'valide' })
      .groupBy('paiement.mode')
      .getRawMany();

    const total = await this.repository
      .createQueryBuilder('paiement')
      .select('SUM(paiement.montant)', 'total')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('paiement.statut = :statut', { statut: 'valide' })
      .getRawOne();

    return {
      total: parseFloat(total.total) || 0,
      parMode: result.map(row => ({
        mode: row.mode,
        nombre: parseInt(row.nombre),
        montantTotal: parseFloat(row.montantTotal)
      }))
    };
  }
}