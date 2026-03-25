// src/facture/facture.service.ts
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Between, Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';




import { DossiersService } from '../dossiers/dossiers.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { CreateFactureDto, StatutFacture } from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { Facture } from './entities/facture.entity';
import { InvoiceType } from '../invoice-type/entities/invoice-type.entity';
import { StepsService } from '../dossiers/step.service';








@Injectable()
export class FactureService extends BaseServiceV1<Facture> {
  constructor(
    @InjectRepository(Facture)
    protected readonly repository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
    @Inject(forwardRef(() => DossiersService))  // 👈 Ajouter forwardRef
    protected readonly dossiersService: DossiersService,    
    @Inject(forwardRef(() => StepsService))
    private stepsService: StepsService,
    
  ) {
    console.log(forwardRef)
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['numero', 'description', 'notesInternes'],
      exactMatchFields: ['id', 'dossierId', 'clientId', 'status', 'type', 'numero'],
      dateRangeFields: ['dateFacture', 'dateEcheance', 'created_at', 'updated_at'],
      relationFields: ['paiements', 'client', 'dossier','invoice_type']
    };
  }

  async createFacture(createDto: CreateFactureDto): Promise<Facture> {
    // Calcul automatique des montants si nécessaire
    if (!createDto.montantTVA) {
      createDto.montantTVA = Number(createDto.montantHT) * (Number(createDto.tauxTVA) / 100);
    }
    if (!createDto.montantTTC) {
      createDto.montantTTC = Number(createDto.montantHT) + Number(createDto.montantTVA);
    }
    const { clientId, dossierId, ...rest } = createDto;

    const dossier = plainToInstance(Dossier, await this.dossiersService.findOne(dossierId))
    const client  =  dossier.client
    const client_id  =  dossier.client.id
    const numero  = await    this.generateFacNumber()

    const facture =this.repository.create({
      ...rest,
      dossier,
      numero,
      client,
      invoice_type : {id: createDto.type} as InvoiceType,
      client_id,
      montantPaye: 0,
      resteAPayer: createDto.montantTTC
    });
    console.log('fffffffffff ' ,facture.dossier.id, ' ',dossierId)

    const fac = await this.repository.save(facture);

    const currentStep = await this.stepsService.getCurrentStep(createDto.dossierId);
    
    // Lier la facture à l'étape (Many-to-One)
    if (currentStep) {
      await this.stepsService.syncActionWithStep('facture', fac.id, currentStep.id);
    }
    
 
    return fac
  
  }

  async updateFacture(id: string, updateDto: UpdateFactureDto): Promise<FactureResponseDto> {
    const facture = await this.findOneV1(id, ['paiements','dossier','client']);
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    // Recalcul des montants si HT ou TVA changent
    if (updateDto.montantHT !== undefined || updateDto.tauxTVA !== undefined) {
      const montantHT = updateDto.montantHT ?? facture.montantHT;
      const tauxTVA = updateDto.tauxTVA ?? facture.tauxTVA;
      
      updateDto.montantTVA = montantHT * (tauxTVA / 100);
      updateDto.montantTTC = montantHT + updateDto.montantTVA;
      // updateDto.resteAPayer = updateDto.montantTTC - facture.montantPaye;
    }

    Object.assign(facture, updateDto);
    // facture.calculerResteAPayer();

    return plainToInstance(FactureResponseDto,this.repository.save(facture));
  }

  async searchFactures(searchDto: SearchFactureDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };
    const factures = await this.repository.find({
      relations: ['paiements', 'client', 'dossier'],
    });
    return plainToInstance(FactureResponseDto, factures);
    // Gestion des ranges de montants
    if (searchDto.montantTTC_min !== undefined || searchDto.montantTTC_max !== undefined) {
      criteria.montantTTC = [
        searchDto.montantTTC_min ?? 0,
        searchDto.montantTTC_max ?? Number.MAX_SAFE_INTEGER
      ];
    }

    return this.searchWithTransformer(
      criteria,
      FactureResponseDto,
      searchDto,
      ['paiements'],
      { created_at: 'DESC' } as any
    );
  }

  async getFacturesByDossier(dossierId: string): Promise<Facture[]> {
    return this.findAllV1({ dossierId }, undefined, ['paiements']);
  }

  async getFacturesByClient(clientId: string): Promise<Facture[]> {
    return this.findAllV1({ clientId }, undefined, ['paiements']);
  }

  async getFacturesImpayees(): Promise<Facture[]> {
    return this.findAllV1(
      { status: StatutFacture.IMPAYEE }, 
      undefined, 
      ['paiements']
    );
  }

  async getFacturesPartiellementPayees(): Promise<Facture[]> {
    return this.findAllV1(
      { status: StatutFacture.PARTIELLEMENT_PAYEE }, 
      undefined, 
      ['paiements']
    );
  }

  async changerStatutFacture(id: string, nouveauStatus: string): Promise<Facture> {
    const facture = await this.findOneV1(id);
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    facture.status = nouveauStatus as any;
    return this.repository.save(facture);
  }

  async getChiffreAffairesParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantTTC)', 'chiffreAffaires')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('facture.status IN (:...statuts)', { 
        statuts: ['envoyee', 'partiellement_payee', 'payee'] 
      })
      .getRawOne();

    return parseFloat(result.chiffreAffaires) || 0;
  }

  async getMontantEncaisseParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantPaye)', 'montantEncaisse')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .getRawOne();

    return parseFloat(result.montantEncaisse) || 0;
  }

  async getStatistiquesPaiements(): Promise<any> {
    const totalFactures = await this.repository
      .createQueryBuilder('facture')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(facture.montantTTC)', 'totalTTC')
      .addSelect('SUM(facture.montantPaye)', 'totalPaye')
      .addSelect('SUM(facture.resteAPayer)', 'totalRestant')
      .getRawOne();

    const parStatut = await this.repository
      .createQueryBuilder('facture')
      .select('facture.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .groupBy('facture.status')
      .getRawMany();

    return {
      total: parseInt(totalFactures.total),
      totalTTC: parseFloat(totalFactures.totalTTC) || 0,
      totalPaye: parseFloat(totalFactures.totalPaye) || 0,
      totalRestant: parseFloat(totalFactures.totalRestant) || 0,
      parStatut
    };
  }

    private async generateFacNumber(): Promise<string> {
      const year = new Date().getFullYear();
      const count = await this.repository.count({
        where: {
          created_at: Between(new Date(`${year}-01-01`), new Date(`${year}-12-31`))
        }
      });
      
      const sequence = (count + 1).toString().padStart(4, '0');
      return `FAC-${year}-${sequence}-${randomUUID().slice(0, 4).toUpperCase()}`; 
    }
}