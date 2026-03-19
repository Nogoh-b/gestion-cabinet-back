// src/modules/customer/customer/services/customer-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerStatus } from './entities/customer.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { TypeCustomer } from '../type-customer/entities/type_customer.entity';
import { CustomerStatsDto } from './dto/customer-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';

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

  async getStats(filters?: StatsFilterDto): Promise<CustomerStatsDto> {
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

  private async getActiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status = :status', { status: CustomerStatus.ACTIVE });
    this.applyFilters(query, filters, 'customer'); ;
    return query.getCount();
  }

  private async getInactiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status = :status', { status: CustomerStatus.INACTIVE });
    this.applyFilters(query, filters, 'customer'); ;
    return query.getCount();
  }

  private async getBlockedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.status IN (:...statuses)', {
        statuses: [CustomerStatus.BLOCKED, CustomerStatus.SUSPENDED, CustomerStatus.LOCKED]
      });
    this.applyFilters(query, filters, 'customer'); ;
    return query.getCount();
  }

  private async getParticuliersCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'PART' });
    this.applyFilters(query, filters, 'customer'); ;
    return query.getCount();
  }

  private async getProfessionnelsCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'PRO' });
    this.applyFilters(query, filters, 'customer'); ;
    return query.getCount();
  }

  private async getEntreprisesCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.type_customer', 'type')
      .where('type.code = :code', { code: 'ENT' });
    this.applyFilters(query, filters, 'customer'); ;
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

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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

    // Distribution par nombre de dossiers
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

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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
      .addSelect("CONCAT(customer.first_name, ' ', customer.last_name)", 'customerName')
      .addSelect('type.name', 'type')
      .addSelect('COUNT(DISTINCT dossier.id)', 'dossierCount')
      .addSelect('COUNT(DISTINCT facture.id)', 'factureCount')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .addSelect('SUM(CASE WHEN facture.status = :payee THEN facture.montantTTC ELSE 0 END)', 'montantPaye')
      .addSelect('MAX(customer.updated_at)', 'lastActivity')
      .setParameter('payee', 'PAYEE')
      .groupBy('customer.id, customer.first_name, customer.last_name')
      .orderBy('montantTotal', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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

    this.applyFilters(query, filters, 'customer'); ;

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