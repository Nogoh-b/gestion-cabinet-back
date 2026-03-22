// src/modules/dossiers/services/dossier-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DangerLevel, Dossier } from './entities/dossier.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { DossierStatsDto, FinancialStatsDto, TimelineStatsDto } from './dto/dossier-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { SingleDossierStatsDto } from './dto/single-dossier-stats.dto';
import { DocumentCustomerStatus } from '../documents/document-customer/entities/document-customer.entity';
import { AudienceStatus } from '../audiences/entities/audience.entity';
import { DiligencePriority, DiligenceStatus } from '../diligence/entities/diligence.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';

@Injectable()
export class DossierStatsService extends BaseStatsService<Dossier> {
  constructor(
    @InjectRepository(Dossier)
    private dossierRepository: Repository<Dossier>,
  ) {
    super(dossierRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<DossierStatsDto | SingleDossierStatsDto> {
    if (filters?.dossierId) {
      return this.getStatsForSingleDossier(filters.dossierId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  private async getActiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .where('dossier.status IN (:...statuses)', {
        statuses: [
          DossierStatus.OPEN,
          DossierStatus.AMICABLE,
          DossierStatus.LITIGATION,
          // DossierStatus.DECISION,
          DossierStatus.APPEAL,
        ],
      });
    this.applyFilters(query, filters, 'dossier'); ;
    return query.getCount();
  }

  private async getClosedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED });
    this.applyFilters(query, filters, 'dossier'); ;
    return query.getCount();
  }

  private async getArchivedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .where('dossier.status = :status', { status: DossierStatus.ARCHIVED });
    this.applyFilters(query, filters, 'dossier'); ;
    return query.getCount();
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.status');

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      // [DossierStatus.DECISION]: 'Décision',
      [DossierStatus.APPEAL]: 'Recours',
      [DossierStatus.CLOSED]: 'Clôturé',
      [DossierStatus.ARCHIVED]: 'Archivé',
    };

    const statusColors = {
      [DossierStatus.OPEN]: '#3b82f6',
      [DossierStatus.AMICABLE]: '#10b981',
      [DossierStatus.LITIGATION]: '#f59e0b',
      // [DossierStatus.DECISION]: '#8b5cf6',
      [DossierStatus.APPEAL]: '#ef4444',
      [DossierStatus.CLOSED]: '#6b7280',
      [DossierStatus.ARCHIVED]: '#9ca3af',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || `Status ${r.status}`,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
      code: DossierStatus[r.status],
    }));
  }

  private async getDistributionByDangerLevel(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.danger_level', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.danger_level');

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const levelLabels = {
      [DangerLevel.Faible]: 'Faible',
      [DangerLevel.Normal]: 'Normal',
      [DangerLevel.Eleve]: 'Élevé',
      [DangerLevel.Critique]: 'Critique',
    };

    const levelColors = {
      [DangerLevel.Faible]: '#10b981',
      [DangerLevel.Normal]: '#3b82f6',
      [DangerLevel.Eleve]: '#f59e0b',
      [DangerLevel.Critique]: '#ef4444',
    };

    return results.map(r => ({
      name: levelLabels[r.level] || `Niveau ${r.level}`,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: levelColors[r.level],
      id: r.level,
    }));
  }

  private async getDistributionByPriority(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.priority_level', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.priority_level');

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const priorityLabels = {
      0: 'Basse',
      1: 'Moyenne',
      2: 'Haute',
      3: 'Urgente',
    };

    const priorityColors = {
      0: '#9ca3af',
      1: '#3b82f6',
      2: '#f59e0b',
      3: '#ef4444',
    };

    return results.map(r => ({
      name: priorityLabels[r.priority] || `Priorité ${r.priority}`,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: priorityColors[r.priority],
      id: r.priority,
    }));
  }

  private async getDistributionByProcedureType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoin('dossier.procedure_type', 'procedureType')
      .select('procedureType.id', 'id')
      .addSelect('procedureType.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('procedureType.id IS NOT NULL')
      .groupBy('procedureType.id, procedureType.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      id: r.id,
    }));
  }

  private async getDistributionByJurisdiction(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoin('dossier.jurisdiction', 'jurisdiction')
      .select('jurisdiction.id', 'id')
      .addSelect('jurisdiction.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('jurisdiction.id IS NOT NULL')
      .groupBy('jurisdiction.id, jurisdiction.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      id: r.id,
    }));
  }

  private async getDistributionByLawyer(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoin('dossier.lawyer', 'lawyer1')
      .leftJoin('lawyer1.user', 'lawyer')
      .select('lawyer.id', 'id')
      .addSelect("CONCAT(lawyer.first_name, ' ', lawyer.last_name)", 'name')
      .addSelect('COUNT(*)', 'count')
      .where('lawyer.id IS NOT NULL')
      .groupBy('lawyer.id, lawyer.first_name, lawyer.last_name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Avocat',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      id: r.id,
    }));
  }

  private async getFinancialStats(filters?: StatsFilterDto): Promise<FinancialStatsDto> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('SUM(dossier.budget_estimate)', 'totalBudget')
      .addSelect('SUM(dossier.actual_costs)', 'totalActual')
      .addSelect('AVG(dossier.budget_estimate)', 'avgBudget')
      .addSelect('AVG(dossier.actual_costs)', 'avgActual')
      .where('dossier.budget_estimate IS NOT NULL OR dossier.actual_costs IS NOT NULL');

    this.applyFilters(query, filters, 'dossier'); ;

    const totals = await query.getRawOne();

    const byStatusQuery = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.status', 'status')
      .addSelect('SUM(dossier.budget_estimate)', 'budgetEstimate')
      .addSelect('SUM(dossier.actual_costs)', 'actualCosts')
      .where('dossier.budget_estimate IS NOT NULL OR dossier.actual_costs IS NOT NULL')
      .groupBy('dossier.status');

    this.applyFilters(byStatusQuery, filters, 'dossier');

    const byStatus = await byStatusQuery.getRawMany();

    const statusLabels = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      // [DossierStatus.DECISION]: 'Décision',
      [DossierStatus.APPEAL]: 'Recours',
      [DossierStatus.CLOSED]: 'Clôturé',
      [DossierStatus.ARCHIVED]: 'Archivé',
    };

    const totalBudget = parseFloat(totals?.totalBudget || 0);
    const totalActual = parseFloat(totals?.totalActual || 0);

    return {
      totalBudgetEstimate: totalBudget,
      totalActualCosts: totalActual,
      averageBudgetPerDossier: parseFloat(totals?.avgBudget || 0),
      averageCostPerDossier: parseFloat(totals?.avgActual || 0),
      budgetVsActual: totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
      byStatus: byStatus.map(s => ({
        status: statusLabels[s.status] || `Status ${s.status}`,
        budgetEstimate: parseFloat(s.budgetEstimate || 0),
        actualCosts: parseFloat(s.actualCosts || 0),
        difference: parseFloat(s.actualCosts || 0) - parseFloat(s.budgetEstimate || 0),
      })),
    };
  }

  private async getTimelineStats(filters?: StatsFilterDto): Promise<TimelineStatsDto> {
    const closedQuery = this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.id')
      .addSelect('dossier.opening_date', 'openingDate')
      .addSelect('dossier.closing_date', 'closingDate')
      .addSelect('DATEDIFF(dossier.closing_date, dossier.opening_date)', 'duration')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED })
      .andWhere('dossier.opening_date IS NOT NULL')
      .andWhere('dossier.closing_date IS NOT NULL');

    this.applyFilters(closedQuery, filters, 'dossier');

    const closedDossiers = await closedQuery.getRawMany();

    const durations = closedDossiers.map(d => parseInt(d.duration)).filter(d => !isNaN(d));
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    const byProcedureQuery = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoin('dossier.procedure_type', 'procedureType')
      .select('procedureType.name', 'procedureType')
      .addSelect('AVG(DATEDIFF(dossier.closing_date, dossier.opening_date))', 'avgDuration')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED })
      .andWhere('dossier.opening_date IS NOT NULL')
      .andWhere('dossier.closing_date IS NOT NULL')
      .andWhere('procedureType.id IS NOT NULL')
      .groupBy('procedureType.name');

    this.applyFilters(byProcedureQuery, filters, 'dossier');

    const byProcedure = await byProcedureQuery.getRawMany();

    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const openingTrendQuery = this.dossierRepository
      .createQueryBuilder('dossier')
      .select("DATE_FORMAT(dossier.opening_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.opening_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(dossier.opening_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(openingTrendQuery, filters, 'dossier');

    const openingTrend = await openingTrendQuery.getRawMany();

    const closingTrendQuery = this.dossierRepository
      .createQueryBuilder('dossier')
      .select("DATE_FORMAT(dossier.closing_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.closing_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .andWhere('dossier.status = :status', { status: DossierStatus.CLOSED })
      .groupBy("DATE_FORMAT(dossier.closing_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(closingTrendQuery, filters, 'dossier');

    const closingTrend = await closingTrendQuery.getRawMany();

    return {
      averageDuration: Math.round(avgDuration),
      shortestDuration: durations.length > 0 ? Math.min(...durations) : 0,
      longestDuration: durations.length > 0 ? Math.max(...durations) : 0,
      byProcedureType: byProcedure.map(p => ({
        procedureType: p.procedureType,
        averageDuration: Math.round(parseFloat(p.avgDuration)),
        count: parseInt(p.count),
      })),
      openingTrend: openingTrend.map(o => ({
        month: o.month,
        count: parseInt(o.count),
      })),
      closingTrend: closingTrend.map(c => ({
        month: c.month,
        count: parseInt(c.count),
      })),
    };
  }

  private async getRecentDossiers(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('dossier.lawyer', 'lawyer')
      .select([
        'dossier.id',
        'dossier.dossier_number',
        'dossier.object',
        'dossier.status',
        'dossier.danger_level',
        'dossier.opening_date',
        'client',
        'lawyer',
      ])
      .orderBy('dossier.opening_date', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getMany();

    return results.map(d => ({
      id: d.id,
      dossierNumber: d.dossier_number,
      object: d.object,
      clientName: d.client?.full_name || 'Client inconnu',
      status: d.status,
      dangerLevel: d.danger_level,
      openingDate: d.opening_date,
      lawyerName: d.lawyer?.full_name || 'Avocat inconnu',
    }));
  }

  private async getUrgentDossiers(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.dossierRepository
      .createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('dossier.lawyer', 'lawyer')
      .leftJoinAndSelect('dossier.audiences', 'audience')
      .where('dossier.status IN (:...activeStatuses)', {
        activeStatuses: [
          DossierStatus.OPEN,
          DossierStatus.AMICABLE,
          DossierStatus.LITIGATION,
        ],
      })
      .andWhere(
        '(dossier.danger_level IN (:...highLevels) OR dossier.priority_level >= :highPriority)',
        {
          highLevels: [DangerLevel.Eleve, DangerLevel.Critique],
          highPriority: 2,
        },
      )
      .orderBy('dossier.danger_level', 'DESC')
      .addOrderBy('dossier.priority_level', 'DESC')
      .addOrderBy('dossier.opening_date', 'ASC')
      .limit(10);

    this.applyFilters(query, filters, 'dossier'); ;

    const results = await query.getMany();

    return results.map(d => {
      const nextAudience = d.audiences?.find(a => 
        a.status === 1 && new Date(a.full_datetime) > new Date()
      );

      return {
        id: d.id,
        dossierNumber: d.dossier_number,
        object: d.object,
        clientName: d.client?.full_name || 'Client inconnu',
        dangerLevel: d.danger_level,
        priorityLevel: d.priority_level,
        nextAudience: nextAudience?.full_datetime,
        daysUntilDeadline: nextAudience
          ? Math.ceil(
              (new Date(nextAudience.full_datetime).getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : undefined,
      };
    });
  }









  private async getStatsForSingleDossier(dossierId: number): Promise<SingleDossierStatsDto> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId },
      relations: [
        'client', 
        'lawyer', 
        'procedure_type', 
        'jurisdiction',
        'audiences',
        'audiences.jurisdiction',
        'documents',
        'documents.document_type',
        'factures',
        'diligences',
        'diligences.assigned_lawyer',
        // 'diligences.assigned_lawyer.user'
      ]
    });

    if (!dossier) {
      throw new Error(`Dossier avec ID ${dossierId} non trouvé`);
    }

    return {
      dossier: {
        id: dossier.id,
        numero: dossier.dossier_number,
        objet: dossier.object,
        client: dossier.client?.full_name || 'Client inconnu',
        avocat: dossier.lawyer?.full_name || 'Avocat non assigné',
        statut: dossier.status,
        niveauDanger: dossier.danger_level,
        dateOuverture: dossier.opening_date,
        dateCloture: dossier.closing_date,
      },
      documents: this.getDocumentsStats(dossier.documents || []),
      audiences: this.getAudiencesStats(dossier.audiences || []),
      diligences: this.getDiligencesStats(dossier.diligences || []),
      factures: this.getFacturesStats(dossier.factures || []),
    };
  }

  private getDocumentsStats(documents: any[]): SingleDossierStatsDto['documents'] {
    const total = documents.length;
    const totalSize = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    documents.forEach(d => {
      const status = d.status || 0;
      byStatusMap.set(status, (byStatusMap.get(status) || 0) + 1);
    });

    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Rejeté',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };

    const statusColors = {
      [DocumentCustomerStatus.PENDING]: '#f59e0b',
      [DocumentCustomerStatus.ACCEPTED]: '#10b981',
      [DocumentCustomerStatus.REFUSED]: '#ef4444',
      [DocumentCustomerStatus.EXPIRED]: '#6b7280',
      [DocumentCustomerStatus.ARCHIVED]: '#9ca3af',
    };

    const byStatus = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: Math.round((count / total) * 100),
      color: statusColors[status] || '#6b7280',
    }));

    // Stats par type
    const byTypeMap = new Map<string, number>();
    documents.forEach(d => {
      const type = d.document_type?.name || 'Non spécifié';
      byTypeMap.set(type, (byTypeMap.get(type) || 0) + 1);
    });

    const byType = Array.from(byTypeMap.entries()).map(([name, count]) => ({
      name,
      value: count,
      percentage: Math.round((count / total) * 100),
    }));

    // Documents récents (5 derniers)
    const recent = [...documents]
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        nom: d.name,
        type: d.document_type?.name || 'Inconnu',
        date: d.uploaded_at,
        taille: this.formatFileSize(d.file_size),
        statut: d.status,
      }));

    return {
      total,
      totalSize,
      totalSizeFormatted: this.formatFileSize(totalSize),
      byStatus,
      byType,
      recent,
    };
  }

  private getAudiencesStats(audiences: any[]): SingleDossierStatsDto['audiences'] {
    const total = audiences.length;
    const maintenant = new Date();

    const passees = audiences.filter(a => new Date(a.full_datetime) < maintenant).length;
    const aVenir = audiences.filter(a => new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED).length;
    const annulees = audiences.filter(a => a.status === AudienceStatus.CANCELLED).length;

    // Prochaine audience
    const prochaines = audiences
      .filter(a => new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime());

    const prochaine = prochaines.length > 0 ? {
      id: prochaines[0].id,
      titre: prochaines[0].title,
      date: prochaines[0].full_datetime,
      jurisdiction: prochaines[0].jurisdiction?.name || 'Inconnue',
      statut: prochaines[0].status,
    } : undefined;

    // Stats par juridiction
    const byJuridictionMap = new Map<string, number>();
    audiences.forEach(a => {
      const jur = a.jurisdiction?.name || 'Inconnue';
      byJuridictionMap.set(jur, (byJuridictionMap.get(jur) || 0) + 1);
    });

    const parJuridiction = Array.from(byJuridictionMap.entries()).map(([name, count]) => ({
      name,
      value: count,
      percentage: Math.round((count / total) * 100),
    }));

    return {
      total,
      passees,
      aVenir,
      annulees,
      prochaine,
      parJuridiction,
    };
  }

  private getDiligencesStats(diligences: any[]): SingleDossierStatsDto['diligences'] {
    const total = diligences.length;
    const maintenant = new Date();

    const enCours = diligences.filter(d => 
      d.status === DiligenceStatus.IN_PROGRESS || d.status === DiligenceStatus.REVIEW
    ).length;

    const terminees = diligences.filter(d => d.status === DiligenceStatus.COMPLETED).length;

    const enRetard = diligences.filter(d => 
      d.status !== DiligenceStatus.COMPLETED && 
      d.status !== DiligenceStatus.CANCELLED &&
      new Date(d.deadline) < maintenant
    ).length;

    const progressionMoyenne = total > 0 
      ? Math.round(diligences.reduce((sum, d) => sum + (d.progress_percentage || 0), 0) / total)
      : 0;

    // Échéances à venir
    const echeances = diligences
      .filter(d => d.status !== DiligenceStatus.COMPLETED && d.status !== DiligenceStatus.CANCELLED)
      .map(d => ({
        id: d.id,
        titre: d.title,
        deadline: d.deadline,
        joursRestants: Math.ceil((new Date(d.deadline).getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24)),
        priorite: this.getPriorityLabel(d.priority),
        progression: d.progress_percentage || 0,
      }))
      .sort((a, b) => a.joursRestants - b.joursRestants)
      .slice(0, 5);

    return {
      total,
      enCours,
      terminees,
      enRetard,
      progressionMoyenne,
      echeances,
    };
  }

  private getFacturesStats(factures: any[]): SingleDossierStatsDto['factures'] {
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

  private getPriorityLabel(priority: string): string {
    const labels = {
      [DiligencePriority.LOW]: 'Basse',
      [DiligencePriority.MEDIUM]: 'Moyenne',
      [DiligencePriority.HIGH]: 'Haute',
      [DiligencePriority.CRITICAL]: 'Critique',
    };
    return labels[priority] || priority;
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
  private async getGlobalStats(filters?: StatsFilterDto): Promise<DossierStatsDto> {
    const [
      total,
      activeCount,
      closedCount,
      archivedCount,
      byStatus,
      byDangerLevel,
      byPriority,
      byProcedureType,
      byJurisdiction,
      byLawyer,
      evolution,
      financialStats,
      timelineStats,
      recentDossiers,
      urgentDossiers,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getActiveCount(filters),
      this.getClosedCount(filters),
      this.getArchivedCount(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByDangerLevel(filters),
      this.getDistributionByPriority(filters),
      this.getDistributionByProcedureType(filters),
      this.getDistributionByJurisdiction(filters),
      this.getDistributionByLawyer(filters),
      this.getEvolution(filters, 'opening_date'),
      this.getFinancialStats(filters),
      this.getTimelineStats(filters),
      this.getRecentDossiers(filters),
      this.getUrgentDossiers(filters),
    ]);

    return {
      total,
      activeDossiers: activeCount,
      closedDossiers: closedCount,
      archivedDossiers: archivedCount,
      evolution,
      byStatus,
      byDangerLevel,
      byPriority,
      byProcedureType,
      byJurisdiction,
      byLawyer,
      financialStats,
      timelineStats,
      recentDossiers,
      urgentDossiers,
    };
  }

  
}