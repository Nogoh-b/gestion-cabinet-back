// src/modules/diligences/services/diligence-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Diligence, DiligencePriority, DiligenceStatus, DiligenceType } from './entities/diligence.entity';
import { DiligenceStatsDto } from './dto/diligence-stats.dto';
import { SingleDiligenceStatsDto } from './dto/single-diligence-stats.dto';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { FindingStatus, FindingSeverity } from './../finding/entities/finding.entity';

@Injectable()
export class DiligenceStatsService extends BaseStatsService<Diligence> {
  constructor(
    @InjectRepository(Diligence)
    private diligenceRepository: Repository<Diligence>,
  ) {
    super(diligenceRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<DiligenceStatsDto | SingleDiligenceStatsDto> {
    // Si un diligenceId est fourni, on retourne les stats détaillées de cette diligence
    if (filters?.diligenceId) {
      return this.getStatsForSingleDiligence(filters.diligenceId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour une diligence spécifique
  private async getStatsForSingleDiligence(diligenceId: number): Promise<SingleDiligenceStatsDto> {
    const diligence = await this.diligenceRepository.findOne({
      where: { id: diligenceId },
      relations: [
        'dossier',
        'dossier.client',
        'dossier.lawyer',
        'dossier.lawyer.user',
        'assigned_lawyer',
        'findings',
        'documents'
      ]
    });

    if (!diligence) {
      throw new Error(`Diligence avec ID ${diligenceId} non trouvée`);
    }

    const maintenant = new Date();
    const deadline = diligence.deadline instanceof Date ? diligence.deadline : new Date(diligence.deadline);
    const joursRestants = diligence.status !== DiligenceStatus.COMPLETED && diligence.status !== DiligenceStatus.CANCELLED
      ? Math.ceil((deadline.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    const estEnRetard = diligence.status !== DiligenceStatus.COMPLETED && 
                        diligence.status !== DiligenceStatus.CANCELLED && 
                        deadline < maintenant;

    return {
      diligence: {
        id: diligence.id,
        titre: diligence.title,
        description: diligence.description,
        type: this.getTypeLabel(diligence.type),
        statut: this.getStatusLabel(diligence.status),
        priorite: this.getPriorityLabel(diligence.priority),
        dateDebut: diligence.start_date,
        deadline: diligence.deadline,
        dateCompletion: diligence.completion_date,
        joursRestants,
        estEnRetard,
        progression: this.calculateProgress(diligence.findings),
      },
      dossier: {
        id: diligence.dossier?.id,
        numero: diligence.dossier?.dossier_number,
        objet: diligence.dossier?.object,
        client: diligence.dossier?.client?.full_name,
        avocat: diligence.dossier?.lawyer?.full_name,
        statut: diligence.dossier?.status,
      },
      avocat: {
        id: diligence.assigned_lawyer?.id,
        nom: diligence.assigned_lawyer?.full_name,
        email: diligence.assigned_lawyer?.email,
        specialisation: diligence.assigned_lawyer?.specialization || 'N/A',
      },
      findings: this.getFindingsStats(diligence.findings || []),
      documents: this.getDocumentsStats(diligence.documents || []),
      temps: {
        heuresBudgetees: diligence.budget_hours || 0,
        heuresPassees: diligence.actual_hours || 0,
        variance: (diligence.actual_hours || 0) - (diligence.budget_hours || 0),
        pourcentageConsomme: diligence.budget_hours 
          ? Math.round(((diligence.actual_hours || 0) / diligence.budget_hours) * 100)
          : 0,
      },
    };
  }

  private getFindingsStats(findings: any[]): SingleDiligenceStatsDto['findings'] {
    const total = findings.length;
    
    const resolus = findings.filter(f => 
      f.status === FindingStatus.RESOLVED || f.status === FindingStatus.WAIVED
    ).length;
    
    const enAttente = findings.filter(f => f.status === FindingStatus.IDENTIFIED).length;
    const abandonnes = findings.filter(f => f.status === FindingStatus.WAIVED).length;

    // Stats par sévérité
    const bySeveriteMap = new Map<string, number>();
    findings.forEach(f => {
      bySeveriteMap.set(f.severity, (bySeveriteMap.get(f.severity) || 0) + 1);
    });

    const severityLabels = {
      [FindingSeverity.CRITICAL]: 'Critique',
      [FindingSeverity.HIGH]: 'Élevée',
      [FindingSeverity.MEDIUM]: 'Moyenne',
      [FindingSeverity.LOW]: 'Faible',
    };

    const severityColors = {
      [FindingSeverity.CRITICAL]: '#ef4444',
      [FindingSeverity.HIGH]: '#f59e0b',
      [FindingSeverity.MEDIUM]: '#3b82f6',
      [FindingSeverity.LOW]: '#10b981',
    };

    const parSeverite = Array.from(bySeveriteMap.entries()).map(([severite, count]) => ({
      severite: severityLabels[severite] || severite,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: severityColors[severite] || '#6b7280',
    }));

    // Findings récents
    const recents = [...findings]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map(f => ({
        id: f.id,
        titre: f.title,
        severite: severityLabels[f.severity] || f.severity,
        statut: this.getFindingStatusLabel(f.status),
        dateCreation: f.created_at,
      }));

    return {
      total,
      resolus,
      enAttente,
      abandonnes,
      parSeverite,
      recents,
    };
  }

  private getDocumentsStats(documents: any[]): SingleDiligenceStatsDto['documents'] {
    const total = documents.length;

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
      recents,
    };
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilterDto): Promise<DiligenceStatsDto> {
    const [
      total,
      inProgress,
      completed,
      overdue,
      cancelled,
      byType,
      byPriority,
      byStatus,
      byLawyer,
      byDossier,
      evolution,
      performance,
      upcomingDeadlines,
      expiredDeadlines,
      completionTrend,
      averageTimeByType,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getInProgressCount(filters),
      this.getCompletedCount(filters),
      this.getOverdueCount(filters),
      this.getCancelledCount(filters),
      this.getDistributionByType(filters),
      this.getDistributionByPriority(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByLawyer(filters),
      this.getDistributionByDossier(filters),
      this.getEvolution(filters),
      this.getPerformanceStats(filters),
      this.getUpcomingDeadlines(filters),
      this.getExpiredDeadlines(filters),
      this.getCompletionTrend(filters),
      this.getAverageTimeByType(filters),
    ]);

    return {
      total,
      inProgress,
      completed,
      overdue,
      cancelled,
      byType,
      byPriority,
      byStatus,
      byLawyer,
      byDossier,
      evolution,
      performance,
      upcomingDeadlines,
      expiredDeadlines,
      completionTrend,
      averageCompletionTimeByType: averageTimeByType,
    };
  }

  // Méthodes utilitaires pour les labels
  private getTypeLabel(type: DiligenceType): string {
    const labels = {
      [DiligenceType.ACQUISITION]: 'Acquisition',
      [DiligenceType.INVESTMENT]: 'Investissement',
      [DiligenceType.IPO]: 'IPO',
      [DiligenceType.COMPLIANCE]: 'Conformité',
      [DiligenceType.LITIGATION]: 'Contentieux',
      [DiligenceType.CONTRACT]: 'Contractuelle',
    };
    return labels[type] || type;
  }

  private getStatusLabel(status: DiligenceStatus): string {
    const labels = {
      [DiligenceStatus.DRAFT]: 'Brouillon',
      [DiligenceStatus.IN_PROGRESS]: 'En cours',
      [DiligenceStatus.REVIEW]: 'En révision',
      [DiligenceStatus.COMPLETED]: 'Terminée',
      [DiligenceStatus.CANCELLED]: 'Annulée',
    };
    return labels[status] || status;
  }

  private getPriorityLabel(priority: DiligencePriority): string {
    const labels = {
      [DiligencePriority.LOW]: 'Basse',
      [DiligencePriority.MEDIUM]: 'Moyenne',
      [DiligencePriority.HIGH]: 'Haute',
      [DiligencePriority.CRITICAL]: 'Critique',
    };
    return labels[priority] || priority;
  }

  private getFindingStatusLabel(status: FindingStatus): string {
    const labels = {
      [FindingStatus.IDENTIFIED]: 'Identifié',
      [FindingStatus.IN_ANALYSIS]: 'En analyse',
      [FindingStatus.VALIDATED]: 'Validé',
      [FindingStatus.RESOLVED]: 'Résolu',
      [FindingStatus.WAIVED]: 'Abandonné',
    };
    return labels[status] || status;
  }

  private calculateProgress(findings: any[]): number {
    if (!findings || findings.length === 0) return 0;
    
    const totalFindings = findings.length;
    const completedFindings = findings.filter(
      f => f.status === FindingStatus.RESOLVED || f.status === FindingStatus.WAIVED
    ).length;
    
    return Math.round((completedFindings / totalFindings) * 100);
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

  // Les méthodes existantes restent inchangées...
  private async getInProgressCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .where('diligence.status IN (:...statuses)', {
        statuses: [DiligenceStatus.IN_PROGRESS, DiligenceStatus.REVIEW],
      });
    this.applyFilters(query, filters, 'diligence');
    return query.getCount();
  }

  private async getCompletedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .where('diligence.status = :status', { status: DiligenceStatus.COMPLETED });
    this.applyFilters(query, filters, 'diligence');
    return query.getCount();
  }

  private async getOverdueCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .where('diligence.deadline < :now', { now: new Date() })
      .andWhere('diligence.status != :completed', { completed: DiligenceStatus.COMPLETED })
      .andWhere('diligence.status != :cancelled', { cancelled: DiligenceStatus.CANCELLED });
    this.applyFilters(query, filters, 'diligence');
    return query.getCount();
  }

  private async getCancelledCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .where('diligence.status = :status', { status: DiligenceStatus.CANCELLED });
    this.applyFilters(query, filters, 'diligence');
    return query.getCount();
  }

  private async getDistributionByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .select('diligence.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('diligence.type')
      .orderBy('count', 'DESC');

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const typeLabels = {
      [DiligenceType.ACQUISITION]: 'Acquisition',
      [DiligenceType.INVESTMENT]: 'Investissement',
      [DiligenceType.IPO]: 'IPO',
      [DiligenceType.COMPLIANCE]: 'Conformité',
      [DiligenceType.LITIGATION]: 'Contentieux',
      [DiligenceType.CONTRACT]: 'Contractuelle',
    };

    const typeColors = {
      [DiligenceType.ACQUISITION]: '#3b82f6',
      [DiligenceType.INVESTMENT]: '#10b981',
      [DiligenceType.IPO]: '#8b5cf6',
      [DiligenceType.COMPLIANCE]: '#f59e0b',
      [DiligenceType.LITIGATION]: '#ef4444',
      [DiligenceType.CONTRACT]: '#ec4899',
    };

    return results.map(r => ({
      name: typeLabels[r.type] || r.type,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: typeColors[r.type],
      id: r.type,
    }));
  }

  private async getDistributionByPriority(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .select('diligence.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('diligence.priority');

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const priorityLabels = {
      [DiligencePriority.LOW]: 'Basse',
      [DiligencePriority.MEDIUM]: 'Moyenne',
      [DiligencePriority.HIGH]: 'Haute',
      [DiligencePriority.CRITICAL]: 'Critique',
    };

    const priorityColors = {
      [DiligencePriority.LOW]: '#9ca3af',
      [DiligencePriority.MEDIUM]: '#3b82f6',
      [DiligencePriority.HIGH]: '#f59e0b',
      [DiligencePriority.CRITICAL]: '#ef4444',
    };

    return results.map(r => ({
      name: priorityLabels[r.priority] || r.priority,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: priorityColors[r.priority],
      id: r.priority,
    }));
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .select('diligence.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('diligence.status');

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [DiligenceStatus.DRAFT]: 'Brouillon',
      [DiligenceStatus.IN_PROGRESS]: 'En cours',
      [DiligenceStatus.REVIEW]: 'En révision',
      [DiligenceStatus.COMPLETED]: 'Terminée',
      [DiligenceStatus.CANCELLED]: 'Annulée',
    };

    const statusColors = {
      [DiligenceStatus.DRAFT]: '#9ca3af',
      [DiligenceStatus.IN_PROGRESS]: '#3b82f6',
      [DiligenceStatus.REVIEW]: '#f59e0b',
      [DiligenceStatus.COMPLETED]: '#10b981',
      [DiligenceStatus.CANCELLED]: '#ef4444',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || r.status,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByLawyer(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoin('diligence.assigned_lawyer', 'lawyer')
      .select('lawyer.id', 'lawyerId')
      .addSelect("CONCAT(lawyer.first_name, ' ', lawyer.last_name)", 'lawyerName')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN diligence.status = :completed THEN 1 ELSE 0 END)', 'completed')
      .addSelect('SUM(CASE WHEN diligence.deadline < :now AND diligence.status != :completed THEN 1 ELSE 0 END)', 'overdue')
      .addSelect('AVG(DATEDIFF(diligence.completion_date, diligence.start_date))', 'avgCompletionTime')
      .setParameters({
        completed: DiligenceStatus.COMPLETED,
        now: new Date(),
      })
      .where('lawyer.id IS NOT NULL')
      .groupBy('lawyer.id, lawyer.first_name, lawyer.last_name')
      .orderBy('total', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getRawMany();

    return results.map(r => ({
      lawyerId: parseInt(r.lawyerId),
      lawyerName: r.lawyerName || 'Avocat',
      total: parseInt(r.total),
      completed: parseInt(r.completed || 0),
      overdue: parseInt(r.overdue || 0),
      onTimeRate: parseInt(r.total) > 0 
        ? Math.round(((parseInt(r.total) - parseInt(r.overdue || 0)) / parseInt(r.total)) * 100)
        : 0,
      averageCompletionTime: Math.round(parseFloat(r.avgCompletionTime || 0)),
    }));
  }

  private async getDistributionByDossier(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoin('diligence.dossier', 'dossier')
      .select('dossier.dossier_number', 'dossierNumber')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.id IS NOT NULL')
      .groupBy('dossier.dossier_number')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.dossierNumber || 'Dossier inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getPerformanceStats(filters?: StatsFilterDto): Promise<any> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoinAndSelect('diligence.findings', 'finding')
      .select('AVG(DATEDIFF(diligence.completion_date, diligence.start_date))', 'avgCompletionTime')
      .addSelect('SUM(diligence.budget_hours)', 'totalBudgetHours')
      .addSelect('SUM(diligence.actual_hours)', 'totalActualHours')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN diligence.deadline >= diligence.completion_date THEN 1 ELSE 0 END)', 'onTime')
      .where('diligence.status = :completed', { completed: DiligenceStatus.COMPLETED });

    this.applyFilters(query, filters, 'diligence');

    const result = await query.getRawOne();

    const allDiligences = await this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoinAndSelect('diligence.findings', 'finding')
      .where('diligence.status = :completed', { completed: DiligenceStatus.COMPLETED })
      .getMany();

    let totalProgress = 0;
    allDiligences.forEach(d => {
      const progress = this.calculateProgress(d.findings);
      totalProgress += progress;
    });
    const avgProgress = allDiligences.length > 0 ? totalProgress / allDiligences.length : 0;

    const totalCompleted = parseInt(result.total || 0);
    const onTime = parseInt(result.onTime || 0);

    return {
      averageCompletionTime: Math.round(parseFloat(result.avgCompletionTime || 0)),
      onTimeRate: totalCompleted > 0 ? Math.round((onTime / totalCompleted) * 100) : 0,
      averageProgress: Math.round(avgProgress),
      totalHoursBudgeted: Math.round(parseFloat(result.totalBudgetHours || 0)),
      totalHoursSpent: Math.round(parseFloat(result.totalActualHours || 0)),
      hoursVariance: Math.round(parseFloat(result.totalActualHours || 0) - parseFloat(result.totalBudgetHours || 0)),
    };
  }

  private async getUpcomingDeadlines(filters?: StatsFilterDto): Promise<any[]> {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoinAndSelect('diligence.dossier', 'dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('diligence.assigned_lawyer', 'lawyer')
      .leftJoinAndSelect('diligence.findings', 'finding')
      .where('diligence.deadline BETWEEN :now AND :thirtyDays', { 
        now, 
        thirtyDays: thirtyDaysFromNow 
      })
      .andWhere('diligence.status != :completed', { completed: DiligenceStatus.COMPLETED })
      .andWhere('diligence.status != :cancelled', { cancelled: DiligenceStatus.CANCELLED })
      .orderBy('diligence.deadline', 'ASC')
      .limit(20);

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getMany();

    return results.map(d => {
      const deadline = d.deadline instanceof Date ? d.deadline : new Date(d.deadline);
      
      return {
        id: d.id,
        title: d.title,
        dossierNumber: d.dossier?.dossier_number,
        clientName: d.dossier?.client?.full_name,
        lawyerName: d.assigned_lawyer?.full_name || 'Non assigné',
        deadline: d.deadline,
        daysRemaining: Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        priority: d.priority,
        progress: this.calculateProgress(d.findings),
      };
    });
  }

  private async getExpiredDeadlines(filters?: StatsFilterDto): Promise<any[]> {
    const now = new Date();

    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .leftJoinAndSelect('diligence.dossier', 'dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('diligence.assigned_lawyer', 'lawyer')
      .where('diligence.deadline < :now', { now })
      .andWhere('diligence.status != :completed', { completed: DiligenceStatus.COMPLETED })
      .andWhere('diligence.status != :cancelled', { cancelled: DiligenceStatus.CANCELLED })
      .orderBy('diligence.deadline', 'ASC')
      .limit(20);

    this.applyFilters(query, filters, 'diligence');

    const results = await query.getMany();

    return results.map(d => {
      const deadline = d.deadline instanceof Date ? d.deadline : new Date(d.deadline);
      
      return {
        id: d.id,
        title: d.title,
        dossierNumber: d.dossier?.dossier_number,
        clientName: d.dossier?.client?.full_name,
        lawyerName: d.assigned_lawyer?.full_name || 'Non assigné',
        deadline: d.deadline,
        daysOverdue: Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24)),
        priority: d.priority,
      };
    });
  }

  private async getCompletionTrend(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .select("DATE_FORMAT(diligence.completion_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'completed')
      .addSelect('AVG(DATEDIFF(diligence.completion_date, diligence.start_date))', 'avgTime')
      .addSelect('SUM(CASE WHEN diligence.deadline >= diligence.completion_date THEN 1 ELSE 0 END) / COUNT(*) * 100', 'onTimeRate')
      .where('diligence.status = :completed', { completed: DiligenceStatus.COMPLETED })
      .andWhere('diligence.completion_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(diligence.completion_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters, 'diligence');

    return query.getRawMany();
  }

  private async getAverageTimeByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.diligenceRepository
      .createQueryBuilder('diligence')
      .select('diligence.type', 'type')
      .addSelect('AVG(DATEDIFF(diligence.completion_date, diligence.start_date))', 'avgTime')
      .addSelect('COUNT(*)', 'count')
      .where('diligence.status = :completed', { completed: DiligenceStatus.COMPLETED })
      .groupBy('diligence.type')
      .orderBy('avgTime', 'DESC');

    this.applyFilters(query, filters, 'diligence');

    return query.getRawMany();
  }
}