// src/modules/customer/type-customer/services/type-customer-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeCustomer } from './entities/type_customer.entity';
import { TypeCustomerDetailDto, TypeCustomerStatsDto } from './dto/type-customer-stats.dto';
import { SingleTypeCustomerStatsDto } from './dto/single-type-customer-stats.dto';
import { CustomerStatus } from './../customer/entities/customer.entity';

@Injectable()
export class TypeCustomerStatsService {
  constructor(
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
  ) {}

  async getStats(typeId?: number): Promise<TypeCustomerStatsDto | SingleTypeCustomerStatsDto> {
    // Si un typeId est fourni, on retourne les stats détaillées de ce type
    if (typeId) {
      return this.getStatsForSingleType(typeId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats();
  }

  // Méthode pour un type de client spécifique
  private async getStatsForSingleType(typeId: number): Promise<SingleTypeCustomerStatsDto> {
    const type = await this.typeCustomerRepository.findOne({
      where: { id: typeId },
      relations: [
        'customers',
        'customers.dossiers',
        'customers.location_city',
        'requiredDocuments'
      ]
    });

    if (!type) {
      throw new Error(`Type de client avec ID ${typeId} non trouvé`);
    }

    const maintenant = new Date();
    const troisMoisAvant = new Date();
    troisMoisAvant.setMonth(troisMoisAvant.getMonth() - 3);

    return {
      type: {
        id: type.id,
        nom: type.name,
        code: type.code,
        description: type['description'],
        statut: type.status,
        dateCreation: type.created_at,
        dateMiseAJour: type.updated_at,
      },
      clients: this.getClientsStats(type.customers || []),
      documentsRequis: this.getDocumentsStats(type.requiredDocuments || []),
      dossiers: this.getDossiersStats(type.customers || []),
      repartitionGeographique: this.getGeographicStats(type.customers || []),
      evolution: this.getEvolutionStats(type.customers || []),
    };
  }

  private getClientsStats(clients: any[]): SingleTypeCustomerStatsDto['clients'] {
    const total = clients.length;
    
    const actifs = clients.filter(c => c.status === CustomerStatus.ACTIVE).length;
    const inactifs = clients.filter(c => c.status === CustomerStatus.INACTIVE).length;
    const bloques = clients.filter(c => 
      [CustomerStatus.BLOCKED, CustomerStatus.SUSPENDED, CustomerStatus.LOCKED].includes(c.status)
    ).length;

    const avecDossiers = clients.filter(c => c.dossiers && c.dossiers.length > 0).length;
    const sansDossiers = total - avecDossiers;

    // Clients récents
    const recents = [...clients]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        nom: c.full_name,
        email: c.email,
        telephone: c.number_phone_1 || c.professional_phone || 'Non renseigné',
        dateCreation: c.created_at,
        dossierCount: c.dossiers?.length || 0,
      }));

    return {
      total,
      actifs,
      inactifs,
      bloques,
      avecDossiers,
      sansDossiers,
      recents,
    };
  }

  private getDocumentsStats(documents: any[]): SingleTypeCustomerStatsDto['documentsRequis'] {
    const total = documents.length;

    const liste = documents.map(d => ({
      id: d.id,
      nom: d.name,
      code: d.code,
      description: d.description,
      obligatoire: d.isRequired || false,
    }));

    // Statistiques par statut (approximatif car on n'a pas les statuts ici)
    const parStatut = [
      { statut: 'Actif', count: documents.filter(d => d.status === 1).length, percentage: 0 },
      { statut: 'Inactif', count: documents.filter(d => d.status !== 1).length, percentage: 0 },
    ];

    // Calculer les pourcentages
    parStatut.forEach(s => {
      s.percentage = total > 0 ? Math.round((s.count / total) * 100) : 0;
    });

    return {
      total,
      liste,
      parStatut: parStatut.filter(s => s.count > 0),
    };
  }

  private getDossiersStats(clients: any[]): SingleTypeCustomerStatsDto['dossiers'] {
    const tousDossiers = clients.flatMap(c => c.dossiers || []);
    const total = tousDossiers.length;

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    tousDossiers.forEach(d => {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) || 0) + 1);
    });

    const statusLabels = {
      0: 'Ouvert',
      1: 'Amiable',
      2: 'Contentieux',
      3: 'Décision',
      4: 'Recours',
      5: 'Clôturé',
      6: 'Archivé',
    };

    const statusColors = {
      0: '#3b82f6',
      1: '#10b981',
      2: '#f59e0b',
      3: '#8b5cf6',
      4: '#ef4444',
      5: '#6b7280',
      6: '#9ca3af',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: statusColors[status] || '#6b7280',
    }));

    // Dossiers récents
    const recents = [...tousDossiers]
      .sort((a, b) => new Date(b.opening_date).getTime() - new Date(a.opening_date).getTime())
      .slice(0, 10)
      .map(d => {
        const client = clients.find(c => c.id === d.client_id);
        return {
          id: d.id,
          numero: d.dossier_number,
          client: client?.full_name || 'Client inconnu',
          statut: d.status,
          dateOuverture: d.opening_date,
        };
      });

    return {
      total,
      parStatut,
      recents,
    };
  }

  private getGeographicStats(clients: any[]): SingleTypeCustomerStatsDto['repartitionGeographique'] {
    const cityMap = new Map<string, number>();

    clients.forEach(c => {
      const city = c.location_city?.name || 'Ville inconnue';
      cityMap.set(city, (cityMap.get(city) || 0) + 1);
    });

    const total = clients.length;
    const repartition = Array.from(cityMap.entries())
      .map(([ville, count]) => ({
        ville,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return repartition;
  }

  private getEvolutionStats(clients: any[]): SingleTypeCustomerStatsDto['evolution'] {
    const maintenant = new Date();
    const sixMoisAvant = new Date();
    sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);

    const evolutionMap = new Map<string, number>();

    clients
      .filter(c => new Date(c.created_at) >= sixMoisAvant)
      .forEach(c => {
        const date = new Date(c.created_at);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        evolutionMap.set(mois, (evolutionMap.get(mois) || 0) + 1);
      });

    const evolution = Array.from(evolutionMap.entries())
      .map(([mois, nouveauxClients]) => ({
        mois,
        nouveauxClients,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    return evolution;
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(): Promise<TypeCustomerStatsDto> {
    const types = await this.typeCustomerRepository
      .createQueryBuilder('type')
      .leftJoinAndSelect('type.customers', 'customer')
      .leftJoinAndSelect('type.requiredDocuments', 'document')
      .loadRelationCountAndMap('type.customersCount', 'type.customers')
      .loadRelationCountAndMap('type.documentsCount', 'type.requiredDocuments')
      .getMany();

    const active = types.filter(t => t.status === 1).length;
    const inactive = types.filter(t => t.status !== 1).length;

    const details: TypeCustomerDetailDto[] = types.map(t => ({
      id: t.id,
      name: t.name,
      code: t.code,
      customersCount: t.customers?.length || 0,
      requiredDocumentsCount: t.requiredDocuments?.length || 0,
      status: t.status,
      createdAt: t.created_at,
    }));

    return {
      total: types.length,
      active,
      inactive,
      details,
    };
  }
}