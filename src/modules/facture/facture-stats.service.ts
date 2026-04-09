// src/modules/factures/services/facture-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facture } from './entities/facture.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { FactureStatsDto } from './dto/facture-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { StatutFacture } from './dto/create-facture.dto';
import { StatutPaiement } from '../paiement/dto/create-paiement.dto';

@Injectable()
export class FactureStatsService extends BaseStatsService<Facture> {
  constructor(
    @InjectRepository(Facture)
    private factureRepository: Repository<Facture>,
  ) {
    super(factureRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<FactureStatsDto> {
    const [
      total,
      totalHT,
      totalTTC,
      totalPaid,
      totalUnpaid,
      paidCount,
      unpaidCount,
      overdueCount,
      byStatus,
      byType,
      byClient,
      byDossier,
      evolution,
      financialSummary,
      overdueStats,
      monthlyRevenue,
      recentInvoices,
      unpaidInvoices,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getTotalHT(filters),
      this.getTotalTTC(filters),
      this.getTotalPaid(filters),
      this.getTotalUnpaid(filters),
      this.getPaidCount(filters),
      this.getUnpaidCount(filters),
      this.getOverdueCount(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByType(filters),
      this.getDistributionByClient(filters),
      this.getDistributionByDossier(filters),
      this.getEvolution(filters),
      this.getFinancialSummary(filters),
      this.getOverdueStats(filters),
      this.getMonthlyRevenue(filters),
      this.getRecentInvoices(filters),
      this.getUnpaidInvoices(filters),
    ]);

    return {
      total,
      totalHT,
      totalTTC,
      totalPaid,
      totalUnpaid,
      paidCount,
      unpaidCount,
      overdueCount,
      byStatus,
      byType,
      byClient,
      byDossier,
      evolution,
      financialSummary,
      overdueStats,
      monthlyRevenue,
      recentInvoices,
      unpaidInvoices,
    };
  }

  private async getTotalHT(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantHT)', 'total');
    this.applyFilters(query, filters, 'facture');
    const result = await query.getRawOne();
    return parseFloat(result.total || 0);
  }

  private async getTotalTTC(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantTTC)', 'total');
    this.applyFilters(query, filters, 'facture');
    const result = await query.getRawOne();
    return parseFloat(result.total || 0);
  }

  private async getTotalPaid(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantTTC)', 'total')
      .where('facture.status = :status', { status: StatutFacture.PAYEE });
    this.applyFilters(query, filters, 'facture');
    const result = await query.getRawOne();
    return parseFloat(result.total || 0);
  }

  private async getTotalUnpaid(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoinAndSelect('facture.paiements', 'paiement', 'paiement.status = :valide', { 
        valide: StatutPaiement.VALIDE 
      })
      .select('SUM(facture.montantTTC - COALESCE(paiement.montant, 0))', 'total')
      .where('facture.status != :status', { status: StatutFacture.PAYEE });
    
    this.applyFilters(query, filters, 'facture');
    const result = await query.getRawOne();
    return parseFloat(result.total || 0);
  }

  private async getPaidCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .where('facture.status = :status', { status: StatutFacture.PAYEE });
    this.applyFilters(query, filters, 'facture');
    return query.getCount();
  }

  private async getUnpaidCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .where('facture.status != :status', { status: StatutFacture.PAYEE })
      .andWhere('facture.status != :brouillon', { brouillon: StatutFacture.BROUILLON });
    this.applyFilters(query, filters, 'facture');
    return query.getCount();
  }

  private async getOverdueCount(filters?: StatsFilterDto): Promise<number> {
    const now = new Date();
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .where('facture.dateEcheance < :now', { now })
      .andWhere('facture.status != :status', { status: StatutFacture.PAYEE })
      .andWhere('facture.status != :brouillon', { brouillon: StatutFacture.BROUILLON });
    this.applyFilters(query, filters, 'facture');
    return query.getCount();
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .select('facture.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'total')
      .groupBy('facture.status');

    this.applyFilters(query, filters, 'facture');

    const results = await query.getRawMany();
    const totalCount = results.reduce((sum, r) => sum + parseInt(r.count), 0);
    const totalAmount = results.reduce((sum, r) => sum + parseFloat(r.total || 0), 0);

    const statusLabels = {
      [StatutFacture.BROUILLON]: 'Brouillon',
      [StatutFacture.ENVOYEE]: 'Envoyée',
      [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
      [StatutFacture.PAYEE]: 'Payée',
      [StatutFacture.IMPAYEE]: 'Impayée',
      [StatutFacture.ANNULEE]: 'Annulée',
    };

    const statusColors = {
      [StatutFacture.BROUILLON]: '#9ca3af',
      [StatutFacture.ENVOYEE]: '#3b82f6',
      [StatutFacture.PARTIELLEMENT_PAYEE]: '#f59e0b',
      [StatutFacture.PAYEE]: '#10b981',
      [StatutFacture.IMPAYEE]: '#ef4444',
      [StatutFacture.ANNULEE]: '#6b7280',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      total: parseFloat(r.total || 0),
      percentage: this.calculatePercentage(parseInt(r.count), totalCount),
      amountPercentage: totalAmount > 0 ? Math.round((parseFloat(r.total || 0) / totalAmount) * 100) : 0,
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoin('facture.invoice_type', 'invoice_type')
      .select('facture.type', 'type')
      .select('invoice_type.name', 'invoice_type_name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'total')
      .groupBy('invoice_type.name');

    this.applyFilters(query, filters, 'facture');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const typeLabels = {
      'HONORAIRES': 'Honoraires',
      'PROVISION': 'Provision',
      'FRAIS': 'Frais',
      'CONDAMNATION': 'Condamnation',
    };

    console.log(results)

    return results.map(r => ({
      name: r.invoice_type_name,
      value: parseInt(r.count),
      total: parseFloat(r.total || 0),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByClient(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoin('facture.client', 'client')
      .select('client.id', 'clientId')
      .addSelect("CONCAT(client.first_name, ' ', client.last_name)", 'customerName')      
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'total')
      .where('client.id IS NOT NULL')
      .groupBy('client.id, client.first_name, client.last_name')
      .orderBy('total', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'facture');

    const results = await query.getRawMany();

    return results.map(r => ({
      name: r.clientName || 'Client inconnu',
      value: parseInt(r.count),
      total: parseFloat(r.total || 0),
      id: r.clientId,
    }));
  }

  private async getDistributionByDossier(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoin('facture.dossier', 'dossier')
      .select('dossier.dossier_number', 'dossierNumber')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'total')
      .where('dossier.id IS NOT NULL')
      .groupBy('dossier.dossier_number')
      .orderBy('total', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'facture');

    const results = await query.getRawMany();

    return results.map(r => ({
      name: r.dossierNumber || 'Dossier inconnu',
      value: parseInt(r.count),
      total: parseFloat(r.total || 0),
    }));
  }

  private async getFinancialSummary(filters?: StatsFilterDto): Promise<any> {
    const [totalHT, totalTTC, totalPaid, largest] = await Promise.all([
      this.getTotalHT(filters),
      this.getTotalTTC(filters),
      this.getTotalPaid(filters),
      this.getLargestInvoice(filters),
    ]);

    const count = await this.getTotalCount(filters);

    return {
      totalHT,
      totalTTC,
      totalPaid,
      totalUnpaid: totalTTC - totalPaid,
      recoveryRate: totalTTC > 0 ? Math.round((totalPaid / totalTTC) * 100) : 0,
      averageInvoiceAmount: count > 0 ? totalTTC / count : 0,
      largestInvoice: largest,
    };
  }

  private async getLargestInvoice(filters?: StatsFilterDto): Promise<any> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoin('facture.client', 'client')
      .select([
        'facture.id',
        'facture.numero',
        'facture.montantTTC',
        "CONCAT(client.first_name, ' ', client.last_name)",
      ])
      .orderBy('facture.montantTTC', 'DESC')
      .limit(1);

    this.applyFilters(query, filters, 'facture');

    const result = await query.getOne();

    return result ? {
      id: result.id,
      numero: result.numero,
      montantTTC: result.montantTTC,
      client: result.client?.full_name,
    } : null;
  }

  private async getOverdueStats(filters?: StatsFilterDto): Promise<any> {
      const now = new Date();

      // Récupérer toutes les factures impayées avec leurs paiements
      const query = this.factureRepository
          .createQueryBuilder('facture')
          .leftJoinAndSelect('facture.client', 'client')
          .leftJoinAndSelect('facture.paiements', 'paiement', 'paiement.status = :valide', {
              valide: StatutPaiement.VALIDE
          })
          .select([
              'facture.id',
              'facture.numero',
              'facture.montantTTC',
              'facture.dateEcheance',
              'client.first_name',
              'client.last_name',
              'paiement.montant',
          ])
          .where('facture.dateEcheance < :now', { now })
          .andWhere('facture.status != :status', { status: StatutFacture.PAYEE })
          .andWhere('facture.status != :brouillon', { brouillon: StatutFacture.BROUILLON });

      this.applyFilters(query, filters, 'facture');

      const results = await query.getMany();

      // Calculer le montant payé pour chaque facture
      const overdueData = results.map(facture => {
          const montantPaye = facture.paiements?.reduce((sum, p) => sum + Number(p.montant), 0) || 0;
          const resteAPayer = facture.montantTTC - montantPaye;
          
          // Convertir la date en objet Date si ce n'est pas déjà le cas
          const dateEcheance = facture.dateEcheance instanceof Date 
              ? facture.dateEcheance 
              : new Date(facture.dateEcheance);
          
          const joursRetard = Math.ceil((now.getTime() - dateEcheance.getTime()) / (1000 * 60 * 60 * 24));

          return {
              id: facture.id,
              numero: facture.numero,
              montantTTC: facture.montantTTC,
              resteAPayer,
              joursRetard,
              clientName: facture.client?.full_name,
          };
      });

      const delays = overdueData.map(inv => inv.joursRetard).filter(d => d > 0);

      const byDelayRange = [
          { range: '1-30 jours', min: 1, max: 30, count: 0, total: 0 },
          { range: '31-60 jours', min: 31, max: 60, count: 0, total: 0 },
          { range: '61-90 jours', min: 61, max: 90, count: 0, total: 0 },
          { range: '> 90 jours', min: 91, max: Infinity, count: 0, total: 0 },
      ];

      overdueData.forEach(inv => {
          const delay = inv.joursRetard;
          const amount = inv.resteAPayer;

          const range = byDelayRange.find(r => delay >= r.min && delay <= r.max);
          if (range) {
              range.count++;
              range.total += amount;
          }
      });

      return {
          count: overdueData.length,
          totalAmount: overdueData.reduce((sum, inv) => sum + inv.resteAPayer, 0),
          averageDelay: delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0,
          maxDelay: delays.length > 0 ? Math.max(...delays) : 0,
          byDelayRange,
      };
  }

  private async getMonthlyRevenue(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.factureRepository
      .createQueryBuilder('facture')
      .select("DATE_FORMAT(facture.dateFacture, '%Y-%m')", 'month')
      .addSelect('SUM(facture.montantHT)', 'totalHT')
      .addSelect('SUM(facture.montantTTC)', 'totalTTC')
      .addSelect('SUM(CASE WHEN facture.status = :paid THEN facture.montantTTC ELSE 0 END)', 'totalPaid')
      .addSelect('COUNT(*)', 'count')
      .setParameter('paid', StatutFacture.PAYEE)
      .where('facture.dateFacture BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(facture.dateFacture, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters, 'facture');

    return query.getRawMany();
  }

  private async getRecentInvoices(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.factureRepository
      .createQueryBuilder('facture')
      .leftJoinAndSelect('facture.client', 'client')
      .leftJoinAndSelect('facture.dossier', 'dossier')
      .orderBy('facture.dateFacture', 'DESC')
      .limit(20);

    this.applyFilters(query, filters, 'facture');

    const results = await query.getMany();

    return results.map(f => ({
      id: f.id,
      numero: f.numero,
      clientName: f.client?.full_name,
      dossierNumber: f.dossier?.dossier_number,
      dateFacture: f.dateFacture,
      montantTTC: f.montantTTC,
      status: f.status,
      isPaid: f.status === StatutFacture.PAYEE,
      isOverdue: f.is_en_retard,
    }));
  }

  private async getUnpaidInvoices(filters?: StatsFilterDto): Promise<any[]> {
      const query = this.factureRepository
          .createQueryBuilder('facture')
          .leftJoinAndSelect('facture.client', 'client')
          .leftJoinAndSelect('facture.dossier', 'dossier')
          .leftJoinAndSelect('facture.paiements', 'paiement', 'paiement.status = :valide', {
              valide: StatutPaiement.VALIDE
          })
          .where('facture.status != :status', { status: StatutFacture.PAYEE })
          .andWhere('facture.status != :brouillon', { brouillon: StatutFacture.BROUILLON })
          .orderBy('facture.dateEcheance', 'ASC')
          .limit(20);

      this.applyFilters(query, filters, 'facture');

      const results = await query.getMany();

      return results.map(f => {
          const montantPaye = f.paiements?.reduce((sum, p) => sum + Number(p.montant), 0) || 0;
          const resteAPayer = f.montantTTC - montantPaye;
          
          // Convertir la date en objet Date
          const dateEcheance = f.dateEcheance instanceof Date 
              ? f.dateEcheance 
              : new Date(f.dateEcheance);
          
          const joursRetard = dateEcheance < new Date() 
              ? Math.ceil((new Date().getTime() - dateEcheance.getTime()) / (1000 * 60 * 60 * 24))
              : 0;

          return {
              id: f.id,
              numero: f.numero,
              clientName: f.client?.full_name,
              dossierNumber: f.dossier?.dossier_number,
              dateFacture: f.dateFacture,
              dateEcheance: f.dateEcheance,
              montantTTC: f.montantTTC,
              resteAPayer,
              joursRetard,
          };
      });
  }
}