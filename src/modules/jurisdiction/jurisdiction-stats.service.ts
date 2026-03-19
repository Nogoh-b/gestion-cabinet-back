// src/modules/jurisdiction/services/jurisdiction-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JurisdictionStatsDto } from './dto/jurisdiction-stats.dto';
import { Jurisdiction, JurisdictionLevel, JurisdictionType } from './entities/jurisdiction.entity';
import { DistributionItem } from 'src/core/types/base-stats.dto';

interface StatsFilters {
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class JurisdictionStatsService {
  constructor(
    @InjectRepository(Jurisdiction)
    private jurisdictionRepository: Repository<Jurisdiction>,
  ) {}

  async getStats(filters?: StatsFilters): Promise<JurisdictionStatsDto> {
    const { startDate, endDate } = filters || {};

    // Construire la condition de date si fournie
    const dateCondition = startDate && endDate ? {
      created_at: Between(startDate, endDate)
    } : {};

    // Total avec filtre de date optionnel
    const total = await this.jurisdictionRepository.count({
      where: dateCondition
    });
    
    const active = await this.jurisdictionRepository.count({ 
      where: { 
        is_active: true,
        ...dateCondition
      } 
    });

    // Stats par niveau avec filtre de date
    const [municipal, regional, national, international] = await Promise.all([
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.MUNICIPAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.REGIONAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.NATIONAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.INTERNATIONAL, ...dateCondition } }),
    ]);
    
    const totalByLevel = municipal + regional + national + international;
    
    const byLevel: DistributionItem[] = [
      { 
        name: 'Municipal', 
        value: municipal, 
        percentage: totalByLevel > 0 ? Math.round((municipal / totalByLevel) * 100) : 0,
        color: '#3b82f6'
      },
      { 
        name: 'Régional', 
        value: regional, 
        percentage: totalByLevel > 0 ? Math.round((regional / totalByLevel) * 100) : 0,
        color: '#10b981'
      },
      { 
        name: 'National', 
        value: national, 
        percentage: totalByLevel > 0 ? Math.round((national / totalByLevel) * 100) : 0,
        color: '#f59e0b'
      },
      { 
        name: 'International', 
        value: international, 
        percentage: totalByLevel > 0 ? Math.round((international / totalByLevel) * 100) : 0,
        color: '#8b5cf6'
      },
    ].filter(item => item.value > 0);

    // Stats par type avec filtre de date
    const [civil, commercial, administrative, penal, labor, family] = await Promise.all([
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.CIVIL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.COMMERCIAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.ADMINISTRATIVE, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.PENAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.LABOR, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { jurisdiction_type: JurisdictionType.FAMILY, ...dateCondition } }),
    ]);
    
    const totalByType = civil + commercial + administrative + penal + labor + family;
    
    const byType: DistributionItem[] = [
      { name: 'Civil', value: civil, percentage: totalByType > 0 ? Math.round((civil / totalByType) * 100) : 0, color: '#3b82f6' },
      { name: 'Commercial', value: commercial, percentage: totalByType > 0 ? Math.round((commercial / totalByType) * 100) : 0, color: '#10b981' },
      { name: 'Administratif', value: administrative, percentage: totalByType > 0 ? Math.round((administrative / totalByType) * 100) : 0, color: '#f59e0b' },
      { name: 'Pénal', value: penal, percentage: totalByType > 0 ? Math.round((penal / totalByType) * 100) : 0, color: '#ef4444' },
      { name: 'Social', value: labor, percentage: totalByType > 0 ? Math.round((labor / totalByType) * 100) : 0, color: '#8b5cf6' },
      { name: 'Famille', value: family, percentage: totalByType > 0 ? Math.round((family / totalByType) * 100) : 0, color: '#ec4899' },
    ].filter(item => item.value > 0);

    // Top juridictions avec filtre de date sur les audiences et dossiers
    let topQuery = this.jurisdictionRepository
      .createQueryBuilder('j')
      .leftJoin('j.audiences', 'audience')
      .leftJoin('audience.dossier', 'dossier')
      .select('j.id', 'id')
      .addSelect('j.name', 'name')
      .addSelect('j.city', 'city')
      .addSelect('COUNT(DISTINCT audience.id)', 'audiencesCount')
      .addSelect('COUNT(DISTINCT dossier.id)', 'dossiersCount')
      .groupBy('j.id')
      .orderBy('audiencesCount', 'DESC')
      .limit(5);

    // Ajouter les filtres de date si fournis
    if (startDate && endDate) {
      topQuery = topQuery
        .andWhere('audience.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('dossier.created_at BETWEEN :startDate AND :endDate', { startDate, endDate });
    } else if (startDate) {
      topQuery = topQuery
        .andWhere('audience.created_at >= :startDate', { startDate })
        .andWhere('dossier.created_at >= :startDate', { startDate });
    } else if (endDate) {
      topQuery = topQuery
        .andWhere('audience.created_at <= :endDate', { endDate })
        .andWhere('dossier.created_at <= :endDate', { endDate });
    }

    const top = await topQuery.getRawMany();

    return {
      total,
      active,
      byLevel,
      byType,
      topJurisdictions: top.map(t => ({
        id: t.id,
        name: t.name,
        city: t.city,
        audiencesCount: parseInt(t.audiencesCount || 0),
        dossiersCount: parseInt(t.dossiersCount || 0),
      })),
    };
  }
}