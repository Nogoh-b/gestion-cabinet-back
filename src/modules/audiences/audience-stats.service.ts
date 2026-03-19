// src/modules/audiences/services/audience-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audience, AudienceStatus } from './entities/audience.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { AudienceStatsDto } from './dto/audience-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';

@Injectable()
export class AudienceStatsService extends BaseStatsService<Audience> {
  constructor(
    @InjectRepository(Audience)
    private audienceRepository: Repository<Audience>,
  ) {
    super(audienceRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<AudienceStatsDto> {
    const [
      total,
      byStatus,
      byType,
      byJurisdiction,
      byDossier,
      evolution,
      upcoming,
      pastStats,
      monthlyTrend,
      weeklyDist,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByType(filters),
      this.getDistributionByJurisdiction(filters),
      this.getDistributionByDossier(filters),
      this.getEvolution(filters, 'audience_date'),
      this.getUpcomingAudiences(filters),
      this.getPastAudiencesStats(filters),  
      this.getMonthlyTrend(filters),
      this.getWeeklyDistribution(filters),
    ]);

    return {
      total,
      scheduled: byStatus.find(s => s.name === 'Planifiée')?.value || 0,
      held: byStatus.find(s => s.name === 'Tenue')?.value || 0,
      postponed: byStatus.find(s => s.name === 'Reportée')?.value || 0,
      cancelled: byStatus.find(s => s.name === 'Annulée')?.value || 0,
      byStatus,
      byType,
      byJurisdiction,
      byDossier,
      evolution,
      upcomingAudiences: upcoming,
      pastAudiences: pastStats,
      monthlyTrend,
      weeklyDistribution: weeklyDist,
    };
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .select('audience.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audience.status');

    this.applyFilters(query, filters, 'audience');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [AudienceStatus.SCHEDULED]: 'Planifiée',
      [AudienceStatus.HELD]: 'Tenue',
      [AudienceStatus.POSTPONED]: 'Reportée',
      [AudienceStatus.CANCELLED]: 'Annulée',
    };

    const statusColors = {
      [AudienceStatus.SCHEDULED]: '#3b82f6',
      [AudienceStatus.HELD]: '#10b981',
      [AudienceStatus.POSTPONED]: '#f59e0b',
      [AudienceStatus.CANCELLED]: '#ef4444',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .select('audience.audience_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audience.audience_type')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'audience');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.type || 'Non spécifié',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByJurisdiction(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .leftJoin('audience.jurisdiction', 'jurisdiction')
      .select('jurisdiction.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('jurisdiction.id IS NOT NULL')
      .groupBy('jurisdiction.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'audience');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByDossier(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .leftJoin('audience.dossier', 'dossier')
      .select('dossier.dossier_number', 'dossierNumber')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.id IS NOT NULL')
      .groupBy('dossier.dossier_number')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'audience');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.dossierNumber || 'Dossier inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getUpcomingAudiences(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .leftJoinAndSelect('audience.dossier', 'dossier')
      .leftJoinAndSelect('audience.jurisdiction', 'jurisdiction')
      .leftJoinAndSelect('dossier.client', 'client')
      .select([
        'audience.id',
        // 'audience.title',
        'audience.audience_date',
        'audience.status',
        'jurisdiction.name',
        'dossier.dossier_number',
        'client',
      ])
      .where('audience.audience_date >= :now', { now: new Date() })
      .andWhere('audience.status = :status', { status: AudienceStatus.SCHEDULED })
      .orderBy('audience.audience_date', 'ASC')
      .limit(10);

    this.applyFilters(query, filters, 'audience');

    const results = await query.getMany();

    return results.map(a => ({
      id: a.id,
      // title: a.title,
      date: a.audience_date,
      jurisdiction: a.jurisdiction?.name || 'Inconnue',
      dossierNumber: a.dossier?.dossier_number || 'N/A',
      clientName: a.dossier?.client?.full_name || 'Client inconnu',
      status: a.status,
    }));
  }

  private async getPastAudiencesStats(filters?: StatsFilterDto): Promise<any> {
      const query = this.audienceRepository
        .createQueryBuilder('audience')
        .select('COUNT(*)', 'total')
        .addSelect(
          "SUM(CASE WHEN audience.status = 'held' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)",
          'successRate',
        )
        .where('audience.audience_date < :now', { now: new Date() });

      this.applyFilters(query, filters, 'audience');

      const result = await query.getRawOne();

      return {
        total: parseInt(result?.total || 0),
        averageDuration: 0, // Valeur par défaut
        successRate: Math.round(parseFloat(result?.successRate || 0)),
      };
  }

  private async getMonthlyTrend(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .select("DATE_FORMAT(audience.audience_date, '%Y-%m')", 'month')
      .addSelect(
        "SUM(CASE WHEN audience.status = 'scheduled' THEN 1 ELSE 0 END)",
        'scheduled',
      )
      .addSelect("SUM(CASE WHEN audience.status = 'held' THEN 1 ELSE 0 END)", 'held')
      .where('audience.audience_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(audience.audience_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters, 'audience');

    return query.getRawMany();
  }

  private async getWeeklyDistribution(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.audienceRepository
      .createQueryBuilder('audience')
      .select('DAYNAME(audience.audience_date)', 'dayOfWeek')
      .addSelect('COUNT(*)', 'count')
      .groupBy('DAYNAME(audience.audience_date)')
      .orderBy(
        "FIELD(DAYNAME(audience.audience_date), 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')",
      );

    this.applyFilters(query, filters, 'audience');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const dayNames = {
      Monday: 'Lundi',
      Tuesday: 'Mardi',
      Wednesday: 'Mercredi',
      Thursday: 'Jeudi',
      Friday: 'Vendredi',
      Saturday: 'Samedi',
      Sunday: 'Dimanche',
    };

    return results.map(r => ({
      dayOfWeek: dayNames[r.dayOfWeek] || r.dayOfWeek,
      count: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }
}