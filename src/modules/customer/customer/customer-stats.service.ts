// src/modules/customer/customer/services/customer-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerStatus } from './entities/customer.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { TypeCustomer } from './../type-customer/entities/type_customer.entity';
import { CustomerStatsDto } from './dto/customer-stats.dto';
import { SingleCustomerStatsDto } from './dto/single-customer-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { DocumentCustomerStatus } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { DiligenceStatus } from 'src/modules/diligence/entities/diligence.entity';

@Injectable()
export class CustomerStatsService extends BaseStatsService<Customer> {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
  ) {
    super(customerRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<CustomerStatsDto | SingleCustomerStatsDto> {
    // Si un customerId est fourni, on retourne les stats détaillées de ce client
    if (filters?.customerId) {
      return this.getStatsForSingleCustomer(filters.customerId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour un client spécifique
  private async getStatsForSingleCustomer(customerId: number): Promise<SingleCustomerStatsDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: [
        'type_customer',
        'location_city',
        'dossiers',
        'dossiers.lawyer',
        'dossiers.lawyer.user',
        'dossiers.audiences',
        'dossiers.audiences.jurisdiction',
        'dossiers.diligences',
        'documents',
        'documents.document_type',
        'factures'
      ]
    });

    if (!customer) {
      throw new Error(`Client avec ID ${customerId} non trouvé`);
    }

    const maintenant = new Date();

    return {
      client: {
        id: customer.id,
        nom: customer.last_name,
        prenom: customer.first_name,
        email: customer.email,
        telephone: customer.number_phone_1,
        telephonePro: customer.professional_phone,
        adresse: customer.address,
        ville: customer.location_city?.name,
        codePostal: customer.postal_code,
        pays: customer.country || 'France',
        type: customer.type_customer?.name || 'Non spécifié',
        typeCode: customer.type_customer?.code || '',
        statut: customer.status,
        dateCreation: customer.created_at,
        derniereActivite: this.getLastActivity(customer),
      },
      dossiers: this.getDossiersStats(customer.dossiers || []),
      audiences: this.getAudiencesStats(customer.dossiers || []),
      diligences: this.getDiligencesStats(customer.dossiers || []),
      documents: this.getDocumentsStats(customer.documents || []),
      factures: this.getFacturesStats(customer.factures || []),
      activiteRecente: this.getRecentActivity(customer),
    };
  }

  private getDossiersStats(dossiers: any[]): SingleCustomerStatsDto['dossiers'] {
    const total = dossiers.length;
    const actifs = dossiers.filter(d => d.is_active).length;
    const clos = dossiers.filter(d => !d.is_active).length;

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    dossiers.forEach(d => {
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
      percentage: Math.round((count / total) * 100),
      color: statusColors[status] || '#6b7280',
    }));

    // Dossiers récents
    const recents = [...dossiers]
      .sort((a, b) => new Date(b.opening_date).getTime() - new Date(a.opening_date).getTime())
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        numero: d.dossier_number,
        objet: d.object,
        statut: d.status,
        dateOuverture: d.opening_date,
        avocat: d.lawyer?.full_name || 'Non assigné',
      }));

    return {
      total,
      actifs,
      clos,
      parStatut,
      recents,
    };
  }

  private getAudiencesStats(dossiers: any[]): SingleCustomerStatsDto['audiences'] {
    const toutesAudiences = dossiers.flatMap(d => d.audiences || []);
    const total = toutesAudiences.length;
    const maintenant = new Date();

    const passees = toutesAudiences.filter(a => new Date(a.full_datetime) < maintenant).length;
    const aVenir = toutesAudiences.filter(a => 
      new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED
    ).length;

    // Prochaine audience
    const prochaines = toutesAudiences
      .filter(a => new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime());

    const prochaine = prochaines.length > 0 ? {
      id: prochaines[0].id,
      titre: prochaines[0].title,
      date: prochaines[0].full_datetime,
      jurisdiction: prochaines[0].jurisdiction?.name || 'Inconnue',
    } : undefined;

    return {
      total,
      passees,
      aVenir,
      prochaine,
    };
  }

  private getDiligencesStats(dossiers: any[]): SingleCustomerStatsDto['diligences'] {
    const toutesDiligences = dossiers.flatMap(d => d.diligences || []);
    const maintenant = new Date();

    const enCours = toutesDiligences.filter(d => 
      d.status === DiligenceStatus.IN_PROGRESS || d.status === DiligenceStatus.REVIEW
    ).length;

    const terminees = toutesDiligences.filter(d => d.status === DiligenceStatus.COMPLETED).length;

    const enRetard = toutesDiligences.filter(d => 
      d.status !== DiligenceStatus.COMPLETED && 
      d.status !== DiligenceStatus.CANCELLED &&
      new Date(d.deadline) < maintenant
    ).length;

    return {
      total: toutesDiligences.length,
      enCours,
      terminees,
      enRetard,
    };
  }

  private getDocumentsStats(documents: any[]): SingleCustomerStatsDto['documents'] {
    const total = documents.length;
    const totalSize = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    documents.forEach(d => {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) || 0) + 1);
    });

    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Rejeté',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: Math.round((count / total) * 100),
    }));

    // Documents récents
    const recents = [...documents]
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        nom: d.name,
        type: d.document_type?.name || 'Inconnu',
        date: d.uploaded_at,
        taille: this.formatFileSize(d.file_size),
      }));

    return {
      total,
      totalSize,
      totalSizeFormatted: this.formatFileSize(totalSize),
      parStatut,
      recents,
    };
  }

  private getFacturesStats(factures: any[]): SingleCustomerStatsDto['factures'] {
    const total = factures.length;
    const montantTotal = factures.reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0);
    const montantPaye = factures
      .filter(f => f.status === StatutFacture.PAYEE)
      .reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0);
    const montantImpaye = montantTotal - montantPaye;
    const tauxRecouvrement = montantTotal > 0 ? Math.round((montantPaye / montantTotal) * 100) : 0;

    // Stats par statut
    const byStatusMap = new Map<number, { count: number; montant: number }>();
    factures.forEach(f => {
      const status = f.status || 0;
      const current = byStatusMap.get(status) || { count: 0, montant: 0 };
      byStatusMap.set(status, {
        count: current.count + 1,
        montant: current.montant + (parseFloat(f.montantTTC) || 0),
      });
    });

    const statusLabels = {
      [StatutFacture.BROUILLON]: 'Brouillon',
      [StatutFacture.ENVOYEE]: 'Envoyée',
      [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
      [StatutFacture.PAYEE]: 'Payée',
      [StatutFacture.IMPAYEE]: 'Impayée',
      [StatutFacture.ANNULEE]: 'Annulée',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, data]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: data.count,
      montant: data.montant,
      percentage: Math.round((data.count / total) * 100),
    }));

    // Factures récentes
    const recentes = [...factures]
      .sort((a, b) => new Date(b.dateFacture).getTime() - new Date(a.dateFacture).getTime())
      .slice(0, 5)
      .map(f => ({
        id: f.id,
        numero: f.numero,
        date: f.dateFacture,
        montant: parseFloat(f.montantTTC) || 0,
        statut: f.status,
        estPayee: f.status === StatutFacture.PAYEE,
      }));

    return {
      total,
      montantTotal,
      montantPaye,
      montantImpaye,
      tauxRecouvrement,
      parStatut,
      recentes,
    };
  }

  private getRecentActivity(customer: any): SingleCustomerStatsDto['activiteRecente'] {
    const activities: any = [];
    const maintenant = new Date();

    // Ajouter les dossiers récents
    if (customer.dossiers) {
      customer.dossiers.slice(0, 3).forEach((d: any) => {
        activities.push({
          id: `dossier-${d.id}`,
          type: 'dossier',
          description: `Nouveau dossier ${d.dossier_number}`,
          date: d.created_at,
          lien: `/dossiers/${d.id}`,
        });
      });
    }

    // Ajouter les audiences à venir
    if (customer.dossiers) {
      const toutesAudiences = customer.dossiers.flatMap((d: any) => d.audiences || []);
      toutesAudiences
        .filter((a: any) => new Date(a.full_datetime) >= maintenant)
        .slice(0, 3)
        .forEach((a: any) => {
          activities.push({
            id: `audience-${a.id}`,
            type: 'audience',
            description: `Audience: ${a.title}`,
            date: a.full_datetime,
            lien: `/audiences/${a.id}`,
          });
        });
    }

    // Ajouter les documents récents
    if (customer.documents) {
      customer.documents.slice(0, 3).forEach((d: any) => {
        activities.push({
          id: `document-${d.id}`,
          type: 'document',
          description: `Document: ${d.name}`,
          date: d.uploaded_at,
          lien: `/documents/${d.id}`,
        });
      });
    }

    // Ajouter les factures récentes
    if (customer.factures) {
      customer.factures.slice(0, 3).forEach((f: any) => {
        activities.push({
          id: `facture-${f.id}`,
          type: 'facture',
          description: `Facture ${f.numero}`,
          date: f.dateFacture,
          lien: `/factures/${f.id}`,
        });
      });
    }

    // Trier par date (plus récent d'abord)
    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }

  private getLastActivity(customer: any): Date | undefined {
    const dates: Date[] = [];

    if (customer.dossiers) {
      customer.dossiers.forEach((d: any) => {
        if (d.created_at) dates.push(new Date(d.created_at));
        if (d.updated_at) dates.push(new Date(d.updated_at));
      });
    }

    if (customer.documents) {
      customer.documents.forEach((d: any) => {
        if (d.uploaded_at) dates.push(new Date(d.uploaded_at));
      });
    }

    if (customer.factures) {
      customer.factures.forEach((f: any) => {
        if (f.dateFacture) dates.push(new Date(f.dateFacture));
      });
    }

    if (dates.length === 0) return undefined;
    return new Date(Math.max(...dates.map(d => d.getTime())));
  }

  private formatFileSize(bytes?: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilterDto): Promise<CustomerStatsDto> {
    const [
      total,
      active,
      inactive,
      blocked,
      particuliers,
      professionnels,
      entreprises,
      byType,
      byStatus,
      byCity,
      byBranch,
      evolution,
      dossierStats,
      financialStats,
      newCustomersTrend,
      topClients,
      recentCustomers,
      customersWithoutDossier,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getActiveCount(filters),
      this.getInactiveCount(filters),
      this.getBlockedCount(filters),
      this.getParticuliersCount(filters),
      this.getProfessionnelsCount(filters),
      this.getEntreprisesCount(filters),
      this.getDistributionByType(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByCity(filters),
      this.getDistributionByBranch(filters),
      this.getEvolution(filters),
      this.getDossierStats(filters),
      this.getFinancialStats(filters),
      this.getNewCustomersTrend(filters),
      this.getTopClients(filters),
      this.getRecentCustomers(filters),
      this.getCustomersWithoutDossier(filters),
    ]);

    return {
      total,
      active,
      inactive,
      blocked,
      particuliers,
      professionnels,
      entreprises,
      byType,
      byStatus,
      byCity,
      byBranch,
      evolution,
      dossierStats,
      financialStats,
      newCustomersTrend,
      topClients,
      recentCustomers,
      customersWithoutDossier,
    };
  }

  // Les méthodes existantes restent inchangées...
  private async getActiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status = :status', { status: CustomerStatus.ACTIVE });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getInactiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status = :status', { status: CustomerStatus.INACTIVE });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getBlockedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status IN (:...statuses)', {
        statuses: [CustomerStatus.BLOCKED, CustomerStatus.SUSPENDED, CustomerStatus.LOCKED]
      });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getParticuliersCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'PART' });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getProfessionnelsCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'PRO' });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getEntreprisesCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'ENT' });
    this.applyFilters(query, filters, 'customer');
    return query.getCount();
  }

  private async getDistributionByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .select('type.name', 'name')
      .addSelect('type.code', 'code')
      .addSelect('COUNT(*)', 'count')
      .where('type.id IS NOT NULL')
      .groupBy('type.name, type.code')
      .orderBy('count', 'DESC');

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const typeColors = {
      'PART': '#3b82f6',
      'PRO': '#10b981',
      'ENT': '#8b5cf6',
    };

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      code: r.code,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: typeColors[r.code] || '#9ca3af',
    }));
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .select('customer.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('customer.status');

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [CustomerStatus.ACTIVE]: 'Actif',
      [CustomerStatus.INACTIVE]: 'Inactif',
      [CustomerStatus.BLOCKED]: 'Bloqué',
      [CustomerStatus.SUSPENDED]: 'Suspendu',
      [CustomerStatus.LOCKED]: 'Verrouillé',
      [CustomerStatus.DELETED]: 'Supprimé',
    };

    const statusColors = {
      [CustomerStatus.ACTIVE]: '#10b981',
      [CustomerStatus.INACTIVE]: '#9ca3af',
      [CustomerStatus.BLOCKED]: '#ef4444',
      [CustomerStatus.SUSPENDED]: '#f59e0b',
      [CustomerStatus.LOCKED]: '#6b7280',
      [CustomerStatus.DELETED]: '#374151',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByCity(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.location_city', 'city')
      .select('city.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('city.id IS NOT NULL')
      .groupBy('city.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByBranch(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.branch', 'branch')
      .select('branch.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('branch.id IS NOT NULL')
      .groupBy('branch.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDossierStats(filters?: StatsFilterDto): Promise<any> {
    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.dossiers', 'dossier')
      .loadRelationCountAndMap('customer.dossierCount', 'customer.dossiers')
      .getMany();

    const totalDossiers = customers.reduce((sum, c) => sum + (c.dossiers?.length || 0), 0);
    const customersWithDossiers = customers.filter(c => c.dossiers && c.dossiers.length > 0).length;
    const customersWithoutDossiers = customers.length - customersWithDossiers;

    const ranges = [
      { min: 0, max: 0, label: '0 dossier' },
      { min: 1, max: 1, label: '1 dossier' },
      { min: 2, max: 3, label: '2-3 dossiers' },
      { min: 4, max: 5, label: '4-5 dossiers' },
      { min: 6, max: 10, label: '6-10 dossiers' },
      { min: 11, max: Infinity, label: '> 10 dossiers' },
    ];

    const byDossierCount = ranges.map(range => {
      const count = customers.filter(c => {
        const dossierCount = c.dossiers?.length || 0;
        return dossierCount >= range.min && dossierCount <= range.max;
      }).length;

      return {
        range: range.label,
        count,
        percentage: this.calculatePercentage(count, customers.length),
      };
    });

    return {
      totalDossiers,
      averageDossiersPerCustomer: customers.length > 0 ? totalDossiers / customers.length : 0,
      customersWithDossiers,
      customersWithoutDossiers,
      byDossierCount,
    };
  }

  private async getFinancialStats(filters?: StatsFilterDto): Promise<any> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.factures', 'facture')
      .select('customer.id', 'customerId')
      .addSelect("CONCAT(customer.first_name, ' ', customer.last_name)", 'customerName')      
      .addSelect('COUNT(facture.id)', 'factureCount')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .addSelect('SUM(CASE WHEN facture.status = :payee THEN facture.montantTTC ELSE 0 END)', 'montantPaye')
      .addSelect('COUNT(dossier.id)', 'dossierCount')
      .leftJoin('customer.dossiers', 'dossier')
      .setParameter('payee', 'PAYEE')
      .groupBy('customer.id, customer.first_name, customer.last_name')
      .orderBy('montantTotal', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'customer');

    const topSpenders = await query.getRawMany();

    const totals = await this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.factures', 'facture')
      .select('COUNT(DISTINCT customer.id)', 'customerCount')
      .addSelect('COUNT(facture.id)', 'totalFactures')
      .addSelect('SUM(facture.montantTTC)', 'totalMontant')
      .addSelect('SUM(CASE WHEN facture.status = :payee THEN facture.montantTTC ELSE 0 END)', 'totalPaye')
      .setParameter('payee', 'PAYEE')
      .getRawOne();

    return {
      totalFactures: parseInt(totals?.totalFactures || 0),
      totalMontantFactures: parseFloat(totals?.totalMontant || 0),
      totalPaye: parseFloat(totals?.totalPaye || 0),
      totalImpaye: parseFloat(totals?.totalMontant || 0) - parseFloat(totals?.totalPaye || 0),
      averagePerCustomer: parseInt(totals?.customerCount || 0) > 0 
        ? parseFloat(totals?.totalMontant || 0) / parseInt(totals?.customerCount || 0)
        : 0,
      topSpenders: topSpenders.map(s => ({
        customerId: parseInt(s.customerId),
        customerName: s.customerName,
        totalFactures: parseInt(s.factureCount || 0),
        montantTotal: parseFloat(s.montantTotal || 0),
        montantPaye: parseFloat(s.montantPaye || 0),
        dossierCount: parseInt(s.dossierCount || 0),
      })),
    };
  }

  private async getNewCustomersTrend(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .select("DATE_FORMAT(customer.created_at, '%Y-%m')", 'month')
      .addSelect("SUM(CASE WHEN type.code = 'PART' THEN 1 ELSE 0 END)", 'particuliers')
      .addSelect("SUM(CASE WHEN type.code = 'PRO' THEN 1 ELSE 0 END)", 'professionnels')
      .addSelect("SUM(CASE WHEN type.code = 'ENT' THEN 1 ELSE 0 END)", 'entreprises')
      .addSelect('COUNT(*)', 'total')
      .where('customer.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(customer.created_at, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();

    return results.map(r => ({
      month: r.month,
      particuliers: parseInt(r.particuliers || 0),
      professionnels: parseInt(r.professionnels || 0),
      entreprises: parseInt(r.entreprises || 0),
      total: parseInt(r.total || 0),
    }));
  }

  private async getTopClients(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .leftJoin('customer.dossiers', 'dossier')
      .leftJoin('customer.factures', 'facture')
      .select('customer.id', 'id')
      .addSelect("CONCAT(customer.first_name, ' ', customer.last_name)", 'name')
      .addSelect('type.name', 'type')
      .addSelect('COUNT(DISTINCT dossier.id)', 'dossierCount')
      .addSelect('COUNT(DISTINCT facture.id)', 'factureCount')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .addSelect('SUM(CASE WHEN facture.status = :payee THEN facture.montantTTC ELSE 0 END)', 'montantPaye')
      .addSelect('MAX(customer.updated_at)', 'lastActivity')
      .setParameter('payee', 'PAYEE')
      .groupBy('customer.id, customer.first_name, customer.last_name, type.name')
      .orderBy('montantTotal', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'customer');

    const results = await query.getRawMany();

    return results.map(r => ({
      id: parseInt(r.id),
      name: r.name,
      type: r.type,
      dossierCount: parseInt(r.dossierCount || 0),
      factureCount: parseInt(r.factureCount || 0),
      montantTotal: parseFloat(r.montantTotal || 0),
      montantPaye: parseFloat(r.montantPaye || 0),
      lastActivity: r.lastActivity,
    }));
  }

  private async getRecentCustomers(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.type_customer', 'type')
      .leftJoinAndSelect('customer.location_city', 'city')
      .leftJoinAndSelect('customer.dossiers', 'dossier')
      .orderBy('customer.created_at', 'DESC')
      .limit(20);

    this.applyFilters(query, filters, 'customer');

    const results = await query.getMany();

    return results.map(c => ({
      id: c.id,
      name: c.full_name,
      type: c.type_customer?.name,
      email: c.email,
      phone: c.number_phone_1 || c.professional_phone,
      city: c.location_city?.name,
      createdAt: c.created_at,
      dossierCount: c.dossiers?.length || 0,
    }));
  }

  private async getCustomersWithoutDossier(filters?: StatsFilterDto): Promise<any[]> {
    const now = new Date();

    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.type_customer', 'type')
      .leftJoinAndSelect('customer.location_city', 'city')
      .leftJoin('customer.dossiers', 'dossier')
      .where('dossier.id IS NULL')
      .orderBy('customer.created_at', 'DESC')
      .limit(20);

    this.applyFilters(query, filters, 'customer');

    const results = await query.getMany();

    return results.map(c => ({
      id: c.id,
      name: c.full_name,
      type: c.type_customer?.name,
      email: c.email,
      phone: c.number_phone_1 || c.professional_phone,
      city: c.location_city?.name,
      createdAt: c.created_at,
      daysSinceCreation: Math.ceil((now.getTime() - c.created_at.getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }
}