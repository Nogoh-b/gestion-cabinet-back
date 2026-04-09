// src/modules/jurisdiction/services/jurisdiction-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JurisdictionStatsDto } from './dto/jurisdiction-stats.dto';
import { SingleJurisdictionStatsDto } from './dto/single-jurisdiction-stats.dto';
import { Jurisdiction, JurisdictionLevel, JurisdictionType } from './entities/jurisdiction.entity';
import { DistributionItem } from 'src/core/types/base-stats.dto';
import { AudienceStatus } from 'src/modules/audiences/entities/audience.entity';

interface StatsFilters {
  startDate?: Date;
  endDate?: Date;
  jurisdictionId?: number;
}

@Injectable()
export class JurisdictionStatsService {
  constructor(
    @InjectRepository(Jurisdiction)
    private jurisdictionRepository: Repository<Jurisdiction>,
  ) {}

  async getStats(filters?: StatsFilters): Promise<JurisdictionStatsDto | SingleJurisdictionStatsDto> {
    // Si un jurisdictionId est fourni, on retourne les stats détaillées de cette juridiction
    if (filters?.jurisdictionId) {
      return this.getStatsForSingleJurisdiction(filters.jurisdictionId, filters);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour une juridiction spécifique
  private async getStatsForSingleJurisdiction(
    jurisdictionId: number, 
    filters?: StatsFilters
  ): Promise<SingleJurisdictionStatsDto> {
    const { startDate, endDate } = filters || {};

    const juridiction = await this.jurisdictionRepository.findOne({
      where: { id: jurisdictionId },
      relations: [
        'audiences',
        'audiences.dossier',
        'audiences.dossier.client',
        'audiences.dossier.lawyer',
        'audiences.dossier.lawyer.user'
      ]
    });

    if (!juridiction) {
      throw new Error(`Juridiction avec ID ${jurisdictionId} non trouvée`);
    }

    // Filtrer les audiences par date si nécessaire
    let audiences = juridiction.audiences || [];
    if (startDate && endDate) {
      audiences = audiences.filter(a => 
        new Date(a.created_at) >= startDate && new Date(a.created_at) <= endDate
      );
    }

    return {
      juridiction: {
        id: juridiction.id,
        nom: juridiction.name,
        code: juridiction.code,
        niveau: this.getLevelLabel(juridiction.level),
        type: this.getTypeLabel(juridiction.jurisdiction_type),
        ville: juridiction.city,
        adresse: juridiction.address,
        telephone: juridiction.phone,
        email: juridiction.email,
        siteWeb: juridiction.website,
        estActive: juridiction.is_active,
        dateCreation: juridiction.created_at,
      },
      audiences: this.getAudiencesStats(audiences),
      dossiers: this.getDossiersStats(audiences),
      avocats: this.getAvocatsStats(audiences),
      performance: this.getPerformanceStats(audiences),
    };
  }

  private getAudiencesStats(audiences: any[]): SingleJurisdictionStatsDto['audiences'] {
    const total = audiences.length;
    const maintenant = new Date();

    const passees = audiences.filter(a => new Date(a.full_datetime) < maintenant).length;
    const aVenir = audiences.filter(a => 
      new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED
    ).length;
    const annulees = audiences.filter(a => a.status === AudienceStatus.CANCELLED).length;
    const tenues = audiences.filter(a => a.status === AudienceStatus.HELD).length;
    const tauxTenues = total > 0 ? Math.round((tenues / total) * 100) : 0;

    // Prochaine audience
    const prochaines = audiences
      .filter(a => new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime());

    const prochaine = prochaines.length > 0 ? {
      id: prochaines[0].id,
      titre: prochaines[0].title,
      date: prochaines[0].full_datetime,
      dossierNumber: prochaines[0].dossier?.dossier_number,
      client: prochaines[0].dossier?.client?.full_name,
    } : undefined;

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    audiences.forEach(a => {
      byStatusMap.set(a.status, (byStatusMap.get(a.status) || 0) + 1);
    });

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

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: Math.round((count / total) * 100),
      color: statusColors[status] || '#6b7280',
    }));

    // Stats par mois
    const parMoisMap = new Map<string, number>();
    audiences.forEach(a => {
      const date = new Date(a.full_datetime);
      const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      parMoisMap.set(mois, (parMoisMap.get(mois) || 0) + 1);
    });

    const parMois = Array.from(parMoisMap.entries())
      .map(([mois, count]) => ({ mois, count }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    return {
      total,
      passees,
      aVenir,
      annulees,
      tauxTenues,
      prochaine,
      parStatut,
      parMois,
    };
  }

  private getDossiersStats(audiences: any[]): SingleJurisdictionStatsDto['dossiers'] {
    // Extraire les dossiers uniques des audiences
    const dossiersMap = new Map();
    audiences.forEach(a => {
      if (a.dossier) {
        dossiersMap.set(a.dossier.id, a.dossier);
      }
    });

    const dossiers = Array.from(dossiersMap.values());
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

    // Stats par type de procédure
    const byTypeMap = new Map<string, number>();
    dossiers.forEach(d => {
      const type = d.procedure_type?.name || 'Non spécifié';
      byTypeMap.set(type, (byTypeMap.get(type) || 0) + 1);
    });

    const parTypeProcedure = Array.from(byTypeMap.entries())
      .map(([name, count]) => ({
        name,
        value: count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Dossiers récents
    const recents = [...dossiers]
      .sort((a, b) => new Date(b.opening_date).getTime() - new Date(a.opening_date).getTime())
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        numero: d.dossier_number,
        objet: d.object,
        client: d.client?.full_name,
        statut: d.status,
        dateOuverture: d.opening_date,
      }));

    return {
      total,
      actifs,
      clos,
      parStatut,
      parTypeProcedure,
      recents,
    };
  }

  private getAvocatsStats(audiences: any[]): SingleJurisdictionStatsDto['avocats'] {
    const avocatsMap = new Map();

    audiences.forEach(a => {
      if (a.dossier?.lawyer) {
        const lawyer = a.dossier.lawyer;
        const current = avocatsMap.get(lawyer.id) || {
          id: lawyer.id,
          nom: lawyer.full_name,
          audiencesCount: 0,
          dossiersCount: 0,
          dossiers: new Set(),
        };

        current.audiencesCount++;
        current.dossiers.add(a.dossier.id);
        avocatsMap.set(lawyer.id, current);
      }
    });

    const avecAudiences = Array.from(avocatsMap.values()).map((a: any) => ({
      id: a.id,
      nom: a.nom,
      audiencesCount: a.audiencesCount,
      dossiersCount: a.dossiers.size,
    }));

    return {
      total: avocatsMap.size,
      avecAudiences: avecAudiences.sort((a, b) => b.audiencesCount - a.audiencesCount),
    };
  }

  private getPerformanceStats(audiences: any[]): SingleJurisdictionStatsDto['performance'] {
    const totalAudiences = audiences.length;

    // Moyenne par mois
    const parMois = this.getAudiencesStats(audiences).parMois;
    const moyenneParMois = parMois.length > 0 
      ? Math.round(totalAudiences / parMois.length) 
      : 0;

    // Mois le plus actif
    const moisPlusActif = parMois.length > 0
      ? parMois.reduce((max, current) => current.count > max.count ? current : max, parMois[0]).mois
      : 'N/A';

    // Jour le plus actif
    const joursMap = new Map<string, number>();
    audiences.forEach(a => {
      const date = new Date(a.full_datetime);
      const jour = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      joursMap.set(jour, (joursMap.get(jour) || 0) + 1);
    });

    const jourPlusActif = joursMap.size > 0
      ? Array.from(joursMap.entries()).reduce((max, current) => current[1] > max[1] ? current : max)[0]
      : 'N/A';

    // Taux d'occupation (basé sur le nombre d'audiences par rapport à la capacité max)
    const tauxOccupation = Math.min(100, Math.round((totalAudiences / 200) * 100)); // 200 = capacité max estimée

    return {
      totalAudiences,
      moyenneParMois,
      moisPlusActif,
      jourPlusActif,
      tauxOccupation,
    };
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilters): Promise<JurisdictionStatsDto> {
    const { startDate, endDate } = filters || {};

    // Construire la condition de date si fournie
    const dateCondition = startDate && endDate ? {
      created_at: Between(startDate, endDate)
    } : {};

    const total = await this.jurisdictionRepository.count({ where: dateCondition });
    const active = await this.jurisdictionRepository.count({ 
      where: { is_active: true, ...dateCondition } 
    });

    // Stats par niveau
    const [municipal, regional, national, international] = await Promise.all([
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.MUNICIPAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.REGIONAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.NATIONAL, ...dateCondition } }),
      this.jurisdictionRepository.count({ where: { level: JurisdictionLevel.INTERNATIONAL, ...dateCondition } }),
    ]);
    
    const totalByLevel = municipal + regional + national + international;
    
    const byLevel: DistributionItem[] = [
      { name: 'Municipal', value: municipal, percentage: totalByLevel > 0 ? Math.round((municipal / totalByLevel) * 100) : 0, color: '#3b82f6' },
      { name: 'Régional', value: regional, percentage: totalByLevel > 0 ? Math.round((regional / totalByLevel) * 100) : 0, color: '#10b981' },
      { name: 'National', value: national, percentage: totalByLevel > 0 ? Math.round((national / totalByLevel) * 100) : 0, color: '#f59e0b' },
      { name: 'International', value: international, percentage: totalByLevel > 0 ? Math.round((international / totalByLevel) * 100) : 0, color: '#8b5cf6' },
    ].filter(item => item.value > 0);

    // Stats par type
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

    // Top juridictions
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

    if (startDate && endDate) {
      topQuery = topQuery
        .andWhere('audience.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('dossier.created_at BETWEEN :startDate AND :endDate', { startDate, endDate });
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

  private getLevelLabel(level: JurisdictionLevel): string {
    const labels = {
      [JurisdictionLevel.MUNICIPAL]: 'Municipal',
      [JurisdictionLevel.REGIONAL]: 'Régional',
      [JurisdictionLevel.NATIONAL]: 'National',
      [JurisdictionLevel.INTERNATIONAL]: 'International',
    };
    return labels[level] || level;
  }

  private getTypeLabel(type: JurisdictionType): string {
    const labels = {
      [JurisdictionType.CIVIL]: 'Civil',
      [JurisdictionType.COMMERCIAL]: 'Commercial',
      [JurisdictionType.ADMINISTRATIVE]: 'Administratif',
      [JurisdictionType.PENAL]: 'Pénal',
      [JurisdictionType.LABOR]: 'Social',
      [JurisdictionType.FAMILY]: 'Famille',
    };
    return labels[type] || type;
  }
}