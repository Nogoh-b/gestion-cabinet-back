// src/modules/agencies/employee/services/employee-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeePosition, EmployeeStatus } from './entities/employee.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { Branch } from './../branch/entities/branch.entity';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { EmployeeStatsDto } from './dto/employee-stats.dto';
import { SingleEmployeeStatsDto } from './dto/single-employee-stats.dto';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { AudienceStatus } from './../../audiences/entities/audience.entity';
import { DiligenceStatus } from 'src/modules/diligence/entities/diligence.entity';

@Injectable()
export class EmployeeStatsService extends BaseStatsService<Employee> {
  constructor(
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
  ) {
    super(employeeRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<EmployeeStatsDto | SingleEmployeeStatsDto> {
    // Si un employeeId est fourni, on retourne les stats détaillées de cet employé
    if (filters?.employeeId) {
      return this.getStatsForSingleEmployee(filters.employeeId, filters);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour un employé spécifique
  private async getStatsForSingleEmployee(
    employeeId: number,
    filters?: StatsFilterDto
  ): Promise<SingleEmployeeStatsDto> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: [
        'user',
        'branch',
        'managed_dossiers',
        'managed_dossiers.client',
        'managed_dossiers.audiences',
        'managed_dossiers.audiences.jurisdiction',
        'managed_dossiers.diligences',
        'collaborating_dossiers',
        'collaborating_dossiers.client',
        'assigned_diligences',
        'assigned_diligences.dossier'
      ]
    });

    if (!employee) {
      throw new Error(`Employé avec ID ${employeeId} non trouvé`);
    }

    const maintenant = new Date();

    return {
      employe: {
        id: employee.id,
        nom: employee.full_name,
        email: employee.email,
        telephone: employee.professional_phone,
        position: employee.position,
        specialisation: employee.specialization,
        numeroBarreau: employee.bar_association_number,
        villeBarreau: employee.bar_association_city,
        anneesExperience: employee.years_of_experience || 0,
        tauxHoraire: employee.hourly_rate || 0,
        dateEmbauche: employee.hireDate,
        dateNaissance: employee.birth_date,
        statut: this.getStatusLabel(employee.status),
        estDisponible: employee.is_available,
        adresseProfessionnelle: employee.professional_address,
        numeroSiret: employee.siret_number,
        numeroTVA: employee.tva_number,
        bio: employee.bio,
        langues: employee.languages || [],
        domainesExpertise: employee.expertise_areas || [],
      },
      resume: this.getResumeStats(employee, filters),
      dossiers: this.getDossiersStats(employee, filters),
      audiences: this.getAudiencesStats(employee, filters),
      diligences: this.getDiligencesStats(employee, filters),
      performance: await this.getPerformanceStatsForEmployee(employee, filters),
      chargeTravail: this.getWorkloadForEmployee(employee),
      collaboration: await this.getCollaborationStats(employee, filters),
    };
  }

  private getResumeStats(employee: Employee, filters?: StatsFilterDto): SingleEmployeeStatsDto['resume'] {
      // Dossiers gérés (responsable principal)
      const managedDossiers = employee.managed_dossiers || [];
      const managedDossiersFiltres = this.filterByDate(managedDossiers, filters, 'created_at');
      
      // Dossiers en collaboration
      const collaboratingDossiers = employee.collaborating_dossiers || [];
      const collaboratingDossiersFiltres = this.filterByDate(collaboratingDossiers, filters, 'created_at');
      
      // Combiner tous les dossiers pour certaines stats globales
      const tousDossiersFiltres = [...managedDossiersFiltres, ...collaboratingDossiersFiltres];
      
      // Stats pour dossiers gérés
      const managedActifs = managedDossiersFiltres.filter(d => 
        d.status !== DossierStatus.CLOSED && d.status !== DossierStatus.ARCHIVED
      );
      const managedClos = managedDossiersFiltres.filter(d => d.status === DossierStatus.CLOSED);
      
      // Stats pour dossiers en collaboration
      const collaboratingActifs = collaboratingDossiersFiltres.filter(d => 
        d.status !== DossierStatus.CLOSED && d.status !== DossierStatus.ARCHIVED
      );
      const collaboratingClos = collaboratingDossiersFiltres.filter(d => d.status === DossierStatus.CLOSED);
      
      // Stats combinées
      const dossiersActifsTotal = managedActifs.length + collaboratingActifs.length;
      const dossiersClosTotal = managedClos.length + collaboratingClos.length;

      // Audiences (de tous les dossiers)
      const toutesAudiences = tousDossiersFiltres.flatMap(d => d.audiences || []);
      const audiencesFiltrees = this.filterByDate(toutesAudiences, filters, 'created_at');
      
      const audiencesAVenir = audiencesFiltrees.filter(a => 
        new Date(a.full_datetime) > new Date() && a.status === AudienceStatus.SCHEDULED
      );
      const audiencesPassees = audiencesFiltrees.filter(a => 
        new Date(a.full_datetime) < new Date()
      );

      // Diligences assignées (personnelles)
      const diligences = employee.assigned_diligences || [];
      const diligencesFiltrees = this.filterByDate(diligences, filters, 'created_at');
      
      const diligencesEnCours = diligencesFiltrees.filter(d => 
        d.status === DiligenceStatus.IN_PROGRESS || d.status === DiligenceStatus.REVIEW
      );
      const diligencesTerminees = diligencesFiltrees.filter(d => d.status === DiligenceStatus.COMPLETED);

      const maxDossiers = employee.max_dossiers || 50;
      const tauxOccupation = Math.min(100, Math.round((dossiersActifsTotal / maxDossiers) * 100));

      return {
        // Stats globales
        dossiersActifs: dossiersActifsTotal,
        dossiersClos: dossiersClosTotal,
        totalDossiers: tousDossiersFiltres.length,
        
        // Détail par type
        managed: {
          actifs: managedActifs.length,
          clos: managedClos.length,
          total: managedDossiersFiltres.length
        },
        collaborating: {
          actifs: collaboratingActifs.length,
          clos: collaboratingClos.length,
          total: collaboratingDossiersFiltres.length
        },
      
        audiencesAVenir: audiencesAVenir.length,
        audiencesPassees: audiencesPassees.length,
        diligencesEnCours: diligencesEnCours.length,
        diligencesTerminees: diligencesTerminees.length,
        tauxOccupation,
      };
  }

  private getDossiersStats(employee: Employee, filters?: StatsFilterDto): SingleEmployeeStatsDto['dossiers'] {
    const dossiers = employee.managed_dossiers || [];
    const dossiersFiltres = this.filterByDate(dossiers, filters, 'created_at');
    const total = dossiersFiltres.length;
    const maintenant = new Date();

    // Dossiers actifs avec prochaine audience
    const actifs = dossiersFiltres
      .filter(d => d.status !== DossierStatus.CLOSED && d.status !== DossierStatus.ARCHIVED)
      .map(d => {
        const prochainesAudiences = (d.audiences || [])
          .filter(a => new Date(a.full_datetime) > maintenant && a.status === AudienceStatus.SCHEDULED)
          .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime());

        return {
          id: d.id,
          numero: d.dossier_number,
          objet: d.object,
          client: d.client?.full_name,
          statut: d.status,
          niveauDanger: d.danger_level,
          dateOuverture: d.opening_date,
          prochaineAudience: prochainesAudiences[0]?.full_datetime,
        };
      });

    // Dossiers récents
    const recents = [...dossiersFiltres]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        numero: d.dossier_number,
        client: d.client?.full_name,
        dateOuverture: d.opening_date,
        statut: d.status,
      }));

    // Répartition par statut
    const byStatusMap = new Map<number, number>();
    dossiersFiltres.forEach(d => {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) || 0) + 1);
    });

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

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: statusColors[status] || '#6b7280',
    }));

    // Répartition par type de procédure
    const typeMap = new Map<string, number>();
    dossiersFiltres.forEach(d => {
      const type = d.procedure_type?.name || 'Non spécifié';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const parType = Array.from(typeMap.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      actifs,
      recents,
      parStatut,
      parType,
    };
  }

  private getAudiencesStats(employee: Employee, filters?: StatsFilterDto): SingleEmployeeStatsDto['audiences'] {
    const dossiers = employee.managed_dossiers || [];
    const toutesAudiences = dossiers.flatMap(d => d.audiences || []);
    const audiencesFiltrees = this.filterByDate(toutesAudiences, filters, 'created_at');
    const maintenant = new Date();

    const aVenir = audiencesFiltrees
      .filter(a => new Date(a.full_datetime) > maintenant && a.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime())
      .map(a => ({
        id: a.id,
        titre: a.title,
        date: a.full_datetime,
        dossier: a.dossier?.dossier_number,
        client: a.dossier?.client?.full_name,
        juridiction: a.jurisdiction?.name,
      }));

    const passees = audiencesFiltrees
      .filter(a => new Date(a.full_datetime) < maintenant)
      .sort((a, b) => new Date(b.full_datetime).getTime() - new Date(a.full_datetime).getTime())
      .slice(0, 10)
      .map(a => ({
        id: a.id,
        titre: a.title,
        date: a.full_datetime,
        dossier: a.dossier?.dossier_number,
        client: a.dossier?.client?.full_name,
        statut: a.status,
      }));

    const audiencesTenues = audiencesFiltrees.filter(a => a.status === AudienceStatus.HELD).length;
    const totalAudiences = audiencesFiltrees.length;
    const tauxTenues = totalAudiences > 0 ? Math.round((audiencesTenues / totalAudiences) * 100) : 0;

    return {
      aVenir,
      passees,
      total: totalAudiences,
      tauxTenues,
    };
  }

  private getDiligencesStats(employee: Employee, filters?: StatsFilterDto): SingleEmployeeStatsDto['diligences'] {
    const diligences = employee.assigned_diligences || [];
    const diligencesFiltrees = this.filterByDate(diligences, filters, 'created_at');
    const maintenant = new Date();

    const enCours = diligencesFiltrees
      .filter(d => d.status === DiligenceStatus.IN_PROGRESS || d.status === DiligenceStatus.REVIEW)
      .map(d => {
        const deadline = d.deadline instanceof Date ? d.deadline : new Date(d.deadline);
        const joursRestants = Math.ceil((deadline.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: d.id,
          titre: d.title,
          dossier: d.dossier?.dossier_number,
          deadline: d.deadline,
          joursRestants,
          priorite: d.priority,
          progression: d.progress_percentage || 0,
        };
      })
      .sort((a, b) => a.joursRestants - b.joursRestants);

    const terminees = diligencesFiltrees
      .filter(d => d.status === DiligenceStatus.COMPLETED)
      .sort((a, b) => new Date(b.completion_date).getTime() - new Date(a.completion_date).getTime())
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        titre: d.title,
        dossier: d.dossier?.dossier_number,
        dateCompletion: d.completion_date,
        statut: d.status,
      }));

    const diligencesTerminees = diligencesFiltrees.filter(d => d.status === DiligenceStatus.COMPLETED).length;
    const totalDiligences = diligencesFiltrees.length;
    const tauxCompletion = totalDiligences > 0 ? Math.round((diligencesTerminees / totalDiligences) * 100) : 0;

    return {
      enCours,
      terminees,
      total: totalDiligences,
      tauxCompletion,
    };
  }

  private async getPerformanceStatsForEmployee(
    employee: Employee,
    filters?: StatsFilterDto
  ): Promise<SingleEmployeeStatsDto['performance']> {
    const dossiers = employee.managed_dossiers || [];
    const dossiersFiltres = this.filterByDate(dossiers, filters, 'created_at');
    
    // Dossiers clos par mois
    const dossiersClos = dossiersFiltres.filter(d => d.status === DossierStatus.CLOSED);
    const closParMois = new Map<string, number>();
    
    dossiersClos.forEach(d => {
      if (d.closing_date) {
        const date = new Date(d.closing_date);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        closParMois.set(mois, (closParMois.get(mois) || 0) + 1);
      }
    });

    const dossiersClosParMois = Array.from(closParMois.entries())
      .map(([mois, count]) => ({ mois, count }))
      .sort((a, b) => a.mois.localeCompare(b.mois))
      .slice(-6);

    // Temps moyen de traitement
    let totalJours = 0;
    let dossiersAvecDuree = 0;
    
    dossiersClos.forEach(d => {
      if (d.opening_date && d.closing_date) {
        const ouverture = new Date(d.opening_date);
        const cloture = new Date(d.closing_date);
        const jours = Math.ceil((cloture.getTime() - ouverture.getTime()) / (1000 * 60 * 60 * 24));
        totalJours += jours;
        dossiersAvecDuree++;
      }
    });

    const tempsMoyenTraitement = dossiersAvecDuree > 0 ? Math.round(totalJours / dossiersAvecDuree) : 0;

    // Taux de succès (basé sur les dossiers clos sans contentieux)
    const dossiersReussis = dossiersClos.filter(d => 
      d.status === DossierStatus.CLOSED && d.final_decision?.includes('favorable')
    ).length;
    const tauxSucces = dossiersClos.length > 0 ? Math.round((dossiersReussis / dossiersClos.length) * 100) : 0;

    // Audiences
    const toutesAudiences = dossiers.flatMap(d => d.audiences || []);
    const audiencesFiltrees = this.filterByDate(toutesAudiences, filters, 'created_at');
    const audiencesTenues = audiencesFiltrees.filter(a => a.status === AudienceStatus.HELD).length;
    const audiencesAnnulees = audiencesFiltrees.filter(a => a.status === AudienceStatus.CANCELLED).length;

    // Diligences dans les temps
    const diligences = employee.assigned_diligences || [];
    const diligencesFiltrees = this.filterByDate(diligences, filters, 'created_at');
    const diligencesDansLesTemps = diligencesFiltrees.filter(d => 
      d.status === DiligenceStatus.COMPLETED && 
      d.completion_date && 
      new Date(d.completion_date) <= new Date(d.deadline)
    ).length;

    return {
      dossiersClosParMois,
      tempsMoyenTraitement,
      tauxSucces,
      audiencesTenues,
      audiencesAnnulees,
      diligencesDansLesTemps,
    };
  }

  private getWorkloadForEmployee(employee: Employee): SingleEmployeeStatsDto['chargeTravail'] {
    const dossiersActifs = (employee.managed_dossiers || []).filter(d => 
      d.status !== DossierStatus.CLOSED && d.status !== DossierStatus.ARCHIVED
    ).length;
    
    const maxLoad = employee.max_dossiers || 50;
    const currentLoad = dossiersActifs;
    const disponibilite = Math.max(0, Math.round(((maxLoad - currentLoad) / maxLoad) * 100));

    let recommandation = '';
    if (disponibilite > 70) {
      recommandation = 'Disponible pour de nouveaux dossiers';
    } else if (disponibilite > 30) {
      recommandation = 'Charge de travail modérée';
    } else if (disponibilite > 0) {
      recommandation = 'Charge élevée, éviter de nouveaux dossiers';
    } else {
      recommandation = 'Surchargé, prioriser les dossiers existants';
    }

    return {
      currentLoad,
      maxLoad,
      disponibilite,
      recommandation,
    };
  }

  private async getCollaborationStats(
    employee: Employee,
    filters?: StatsFilterDto
  ): Promise<SingleEmployeeStatsDto['collaboration']> {
    const collaboratingDossiers = employee.collaborating_dossiers || [];
    const dossiersFiltres = this.filterByDate(collaboratingDossiers, filters, 'created_at');
    
    // Compter les collaborateurs fréquents
    const collaborateurMap = new Map<number, { nom: string; count: number }>();

    dossiersFiltres.forEach(dossier => {
      if (dossier.lawyer_id && dossier.lawyer_id !== employee.id) {
        const current = collaborateurMap.get(dossier.lawyer_id) || {
          nom: dossier.lawyer?.full_name || 'Inconnu',
          count: 0,
        };
        current.count++;
        collaborateurMap.set(dossier.lawyer_id, current);
      }
    });

    const colleguesFrequents = Array.from(collaborateurMap.entries())
      .map(([id, data]) => ({
        id,
        nom: data.nom,
        dossiersCommuns: data.count,
      }))
      .sort((a, b) => b.dossiersCommuns - a.dossiersCommuns)
      .slice(0, 5);

    return {
      dossiersPartages: dossiersFiltres.length,
      colleguesFrequents,
    };
  }

  // Méthodes utilitaires
  private getStatusLabel(status: EmployeeStatus): string {
    const labels = {
      [EmployeeStatus.ACTIVE]: 'Actif',
      [EmployeeStatus.INACTIVE]: 'Inactif',
      [EmployeeStatus.SUSPENDED]: 'Suspendu',
      [EmployeeStatus.VACATION]: 'Congés',
    };
    return labels[status] || 'Inconnu';
  }

  private filterByDate(items: any[], filters?: StatsFilterDto, dateField: string = 'created_at'): any[] {
    if (!filters?.startDate && !filters?.endDate) return items;
    
    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      if (filters?.startDate && itemDate < new Date(filters.startDate)) return false;
      if (filters?.endDate && itemDate > new Date(filters.endDate)) return false;
      return true;
    });
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilterDto): Promise<EmployeeStatsDto> {
    const [
      total,
      active,
      inactive,
      onVacation,
      avocats,
      secretaires,
      assistants,
      stagiaires,
      huissiers,
      administratifs,
      byPosition,
      byStatus,
      byBranch,
      bySpecialization,
      evolution,
      workloadStats,
      performanceStats,
      newHiresTrend,
      topPerformers,
      recentEmployees,
      availableEmployees,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getActiveCount(filters),
      this.getInactiveCount(filters),
      this.getOnVacationCount(filters),
      this.getCountByPosition(EmployeePosition.AVOCAT, filters),
      this.getCountByPosition(EmployeePosition.SECRETAIRE, filters),
      this.getCountByPosition(EmployeePosition.ASSISTANT, filters),
      this.getCountByPosition(EmployeePosition.STAGIAIRE, filters),
      this.getCountByPosition(EmployeePosition.HUISSIER, filters),
      this.getCountByPosition(EmployeePosition.ADMINISTRATIF, filters),
      this.getDistributionByPosition(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByBranch(filters),
      this.getDistributionBySpecialization(filters),
      this.getEvolution(filters, 'hireDate', 'employee'),
      this.getWorkloadStats(filters),
      this.getPerformanceStats(filters),
      this.getNewHiresTrend(filters),
      this.getTopPerformers(filters),
      this.getRecentEmployees(filters),
      this.getAvailableEmployees(filters),
    ]);

    return {
      total,
      active,
      inactive,
      onVacation,
      avocats,
      secretaires,
      assistants,
      stagiaires,
      huissiers,
      administratifs,
      byPosition,
      byStatus,
      byBranch,
      bySpecialization,
      evolution,
      workloadStats,
      performanceStats,
      newHiresTrend,
      topPerformers,
      recentEmployees,
      availableEmployees,
    };
  }

  private async getActiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.status = :status', { status: EmployeeStatus.ACTIVE });
    this.applyFilters(query, filters, 'employee');
    return query.getCount();
  }

  private async getInactiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.status = :status', { status: EmployeeStatus.INACTIVE });
    this.applyFilters(query, filters, 'employee');
    return query.getCount();
  }

  private async getOnVacationCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.status = :status', { status: EmployeeStatus.VACATION });
    this.applyFilters(query, filters, 'employee');
    return query.getCount();
  }

  private async getCountByPosition(position: EmployeePosition, filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.position = :position', { position });
    this.applyFilters(query, filters, 'employee');
    return query.getCount();
  }

  private async getDistributionByPosition(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.position', 'position')
      .addSelect('COUNT(*)', 'count')
      .groupBy('employee.position')
      .orderBy('count', 'DESC');

    this.applyFilters(query, filters, 'employee');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const positionLabels = {
      [EmployeePosition.AVOCAT]: 'Avocats',
      [EmployeePosition.SECRETAIRE]: 'Secrétaires',
      [EmployeePosition.ASSISTANT]: 'Assistants',
      [EmployeePosition.STAGIAIRE]: 'Stagiaires',
      [EmployeePosition.HUISSIER]: 'Huissiers',
      [EmployeePosition.ADMINISTRATIF]: 'Administratifs',
    };

    const positionColors = {
      [EmployeePosition.AVOCAT]: '#3b82f6',
      [EmployeePosition.SECRETAIRE]: '#10b981',
      [EmployeePosition.ASSISTANT]: '#f59e0b',
      [EmployeePosition.STAGIAIRE]: '#8b5cf6',
      [EmployeePosition.HUISSIER]: '#ec4899',
      [EmployeePosition.ADMINISTRATIF]: '#6b7280',
    };

    return results.map(r => ({
      name: positionLabels[r.position] || r.position,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: positionColors[r.position],
      id: r.position,
    }));
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('employee.status');

    this.applyFilters(query, filters, 'employee');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [EmployeeStatus.ACTIVE]: 'Actif',
      [EmployeeStatus.INACTIVE]: 'Inactif',
      [EmployeeStatus.SUSPENDED]: 'Suspendu',
      [EmployeeStatus.VACATION]: 'Congés',
    };

    const statusColors = {
      [EmployeeStatus.ACTIVE]: '#10b981',
      [EmployeeStatus.INACTIVE]: '#9ca3af',
      [EmployeeStatus.SUSPENDED]: '#ef4444',
      [EmployeeStatus.VACATION]: '#f59e0b',
    };

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByBranch(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.branch', 'branch')
      .select('branch.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('branch.id IS NOT NULL')
      .groupBy('branch.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'employee');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionBySpecialization(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select(['employee.specialization'])
      .where('employee.specialization IS NOT NULL');

    this.applyFilters(query, filters, 'employee');

    const employees = await query.getMany();
    
    const specializationCount = new Map<string, number>();
    employees.forEach(emp => {
      if (emp.specialization) {
        const specs = emp.specialization.split(',').map(s => s.trim());
        specs.forEach(spec => {
          specializationCount.set(spec, (specializationCount.get(spec) || 0) + 1);
        });
      }
    });

    const results = Array.from(specializationCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const total = results.reduce((sum, r) => sum + r.count, 0);

    return results.map(r => ({
      name: r.name,
      value: r.count,
      percentage: this.calculatePercentage(r.count, total),
    }));
  }

  private async getWorkloadStats(filters?: StatsFilterDto): Promise<any> {
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.managed_dossiers', 'dossier')
      .leftJoinAndSelect('employee.collaborating_dossiers', 'collab')
      .where('employee.status = :status', { status: EmployeeStatus.ACTIVE })
      .getMany();

    const workloadData = employees.map(emp => {
      const managedCount = emp.managed_dossiers?.length || 0;
      const collaboratingCount = emp.collaborating_dossiers?.length || 0;
      const totalDossiers = managedCount + collaboratingCount;
      const maxDossiers = emp.max_dossiers || 50;
      const loadPercentage = (totalDossiers / maxDossiers) * 100;

      return {
        employeeId: emp.id,
        totalDossiers,
        maxDossiers,
        loadPercentage,
        isOverloaded: loadPercentage > 80,
        isUnderloaded: loadPercentage < 20,
      };
    });

    const totalDossiers = workloadData.reduce((sum, w) => sum + w.totalDossiers, 0);
    const overloadedCount = workloadData.filter(w => w.isOverloaded).length;
    const underloadedCount = workloadData.filter(w => w.isUnderloaded).length;

    const ranges = [
      { min: 0, max: 20, label: '0-20%' },
      { min: 21, max: 40, label: '21-40%' },
      { min: 41, max: 60, label: '41-60%' },
      { min: 61, max: 80, label: '61-80%' },
      { min: 81, max: 100, label: '81-100%' },
      { min: 101, max: Infinity, label: '> 100%' },
    ];

    const byLoadRange = ranges.map(range => {
      const employeesInRange = workloadData.filter(w => 
        w.loadPercentage >= range.min && w.loadPercentage <= range.max
      );
      const avgLoad = employeesInRange.length > 0
        ? employeesInRange.reduce((sum, w) => sum + w.loadPercentage, 0) / employeesInRange.length
        : 0;

      return {
        range: range.label,
        count: employeesInRange.length,
        percentage: this.calculatePercentage(employeesInRange.length, employees.length),
        averageLoad: Math.round(avgLoad),
      };
    });

    return {
      totalDossiers,
      averageDossiersPerEmployee: employees.length > 0 ? totalDossiers / employees.length : 0,
      maxDossiers: Math.max(...workloadData.map(w => w.totalDossiers)),
      overloadedEmployees: overloadedCount,
      underloadedEmployees: underloadedCount,
      byLoadRange,
    };
  }

  private async getPerformanceStats(filters?: StatsFilterDto): Promise<any> {
    const globalQuery = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.managed_dossiers', 'dossier')
      .leftJoin('employee.managed_dossiers', 'completedDossier', 'completedDossier.status = :closed', { closed: 5 })
      .leftJoin('employee.managed_dossiers', 'audienceDossier')
      .leftJoin('audienceDossier.audiences', 'audience')
      .leftJoin('employee.assigned_diligences', 'diligence')
      .select('COUNT(DISTINCT dossier.id)', 'totalDossiers')
      .addSelect('COUNT(DISTINCT completedDossier.id)', 'completedDossiers')
      .addSelect('AVG(DATEDIFF(completedDossier.closing_date, completedDossier.opening_date))', 'avgCompletionTime')
      .addSelect('COUNT(DISTINCT audience.id)', 'totalAudiences')
      .addSelect('SUM(CASE WHEN audience.status = :held THEN 1 ELSE 0 END)', 'audiencesHeld')
      .addSelect('COUNT(DISTINCT diligence.id)', 'totalDiligences')
      .addSelect('SUM(CASE WHEN diligence.status = :completed THEN 1 ELSE 0 END)', 'diligencesCompleted')
      .addSelect('SUM(CASE WHEN diligence.deadline >= diligence.completion_date THEN 1 ELSE 0 END)', 'diligencesOnTime')
      .setParameters({
        held: 'held',
        completed: 'completed',
      });

    this.applyFilters(globalQuery, filters, 'employee');

    const global = await globalQuery.getRawOne();

    const byPositionQuery = this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.position', 'position')
      .addSelect('COUNT(DISTINCT employee.id)', 'employeeCount')
      .addSelect('COUNT(DISTINCT dossier.id)', 'totalDossiers')
      .addSelect('AVG(DATEDIFF(completedDossier.closing_date, completedDossier.opening_date))', 'avgCompletionTime')
      .addSelect('SUM(CASE WHEN completedDossier.status = :closed THEN 1 ELSE 0 END) / COUNT(DISTINCT dossier.id) * 100', 'successRate')
      .leftJoin('employee.managed_dossiers', 'dossier')
      .leftJoin('employee.managed_dossiers', 'completedDossier', 'completedDossier.status = :closed')
      .setParameter('closed', 5)
      .groupBy('employee.position');

    this.applyFilters(byPositionQuery, filters, 'employee');

    const byPosition = await byPositionQuery.getRawMany();

    const positionLabels = {
      [EmployeePosition.AVOCAT]: 'Avocats',
      [EmployeePosition.SECRETAIRE]: 'Secrétaires',
      [EmployeePosition.ASSISTANT]: 'Assistants',
      [EmployeePosition.STAGIAIRE]: 'Stagiaires',
      [EmployeePosition.HUISSIER]: 'Huissiers',
      [EmployeePosition.ADMINISTRATIF]: 'Administratifs',
    };

    return {
      averageDossierCompletionTime: Math.round(parseFloat(global?.avgCompletionTime || 0)),
      averageDossierSuccessRate: 75,
      totalAudiences: parseInt(global?.totalAudiences || 0),
      audiencesHeld: parseInt(global?.audiencesHeld || 0),
      audiencesSuccessRate: parseInt(global?.totalAudiences || 0) > 0
        ? Math.round((parseInt(global?.audiencesHeld || 0) / parseInt(global?.totalAudiences || 0)) * 100)
        : 0,
      totalDiligences: parseInt(global?.totalDiligences || 0),
      diligencesCompleted: parseInt(global?.diligencesCompleted || 0),
      diligencesOnTime: parseInt(global?.diligencesOnTime || 0),
      byPosition: byPosition.map(p => ({
        position: positionLabels[p.position] || p.position,
        employeeCount: parseInt(p.employeeCount || 0),
        averageDossiers: parseInt(p.totalDossiers || 0) / parseInt(p.employeeCount || 1),
        averageCompletionTime: Math.round(parseFloat(p.avgCompletionTime || 0)),
        successRate: Math.round(parseFloat(p.successRate || 0)),
      })),
    };
  }

  private async getNewHiresTrend(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select("DATE_FORMAT(employee.hireDate, '%Y-%m')", 'month')
      .addSelect("SUM(CASE WHEN employee.position = :avocat THEN 1 ELSE 0 END)", 'avocats')
      .addSelect("SUM(CASE WHEN employee.position = :secretaire THEN 1 ELSE 0 END)", 'secretaires')
      .addSelect("SUM(CASE WHEN employee.position = :assistant THEN 1 ELSE 0 END)", 'assistants')
      .addSelect("SUM(CASE WHEN employee.position = :stagiaire THEN 1 ELSE 0 END)", 'stagiaires')
      .addSelect('COUNT(*)', 'total')
      .setParameters({
        avocat: EmployeePosition.AVOCAT,
        secretaire: EmployeePosition.SECRETAIRE,
        assistant: EmployeePosition.ASSISTANT,
        stagiaire: EmployeePosition.STAGIAIRE,
      })
      .where('employee.hireDate BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(employee.hireDate, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(query, filters, 'employee');

    const results = await query.getRawMany();

    return results.map(r => ({
      month: r.month,
      avocats: parseInt(r.avocats || 0),
      secretaires: parseInt(r.secretaires || 0),
      assistants: parseInt(r.assistants || 0),
      stagiaires: parseInt(r.stagiaires || 0),
      total: parseInt(r.total || 0),
    }));
  }

  private async getTopPerformers(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoin('employee.managed_dossiers', 'dossier')
      .leftJoin('employee.managed_dossiers', 'completedDossier', 'completedDossier.status = :closed')
      .leftJoin('dossier.audiences', 'audience')
      .leftJoin('employee.assigned_diligences', 'diligence')
      .select('employee.id', 'id')
      .addSelect("CONCAT(user.first_name, ' ', user.last_name)", 'name')
      .addSelect('employee.position', 'position')
      .addSelect('branch.name', 'branch')
      .addSelect('COUNT(DISTINCT dossier.id)', 'dossierCount')
      .addSelect('COUNT(DISTINCT completedDossier.id)', 'completedDossiers')
      .addSelect('AVG(DATEDIFF(completedDossier.closing_date, completedDossier.opening_date))', 'avgCompletionTime')
      .addSelect('COUNT(DISTINCT audience.id)', 'audienceCount')
      .addSelect('COUNT(DISTINCT diligence.id)', 'diligenceCount')
      .setParameter('closed', 5)
      .groupBy('employee.id, user.first_name, user.last_name, employee.position, branch.name')
      .orderBy('completedDossiers', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'employee');

    const results = await query.getRawMany();

    return results.map(r => ({
      id: parseInt(r.id),
      name: r.name,
      position: r.position,
      branch: r.branch,
      dossierCount: parseInt(r.dossierCount || 0),
      completedDossiers: parseInt(r.completedDossiers || 0),
      successRate: parseInt(r.dossierCount || 0) > 0
        ? Math.round((parseInt(r.completedDossiers || 0) / parseInt(r.dossierCount || 0)) * 100)
        : 0,
      averageCompletionTime: Math.round(parseFloat(r.avgCompletionTime || 0)),
      audienceCount: parseInt(r.audienceCount || 0),
      diligenceCount: parseInt(r.diligenceCount || 0),
    }));
  }

  private async getRecentEmployees(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoinAndSelect('employee.managed_dossiers', 'dossier')
      .orderBy('employee.hireDate', 'DESC')
      .limit(20);

    this.applyFilters(query, filters, 'employee');

    const results = await query.getMany();

    return results.map(e => ({
      id: e.id,
      name: e.full_name,
      position: e.position,
      branch: e.branch?.name,
      email: e.email,
      phone: e.professional_phone,
      hireDate: e.hireDate,
      status: e.status,
      dossierCount: e.managed_dossiers?.length || 0,
    }));
  }

  private async getAvailableEmployees(filters?: StatsFilterDto): Promise<any[]> {
    const employees = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoinAndSelect('employee.managed_dossiers', 'dossier')
      .where('employee.status = :status', { status: EmployeeStatus.ACTIVE })
      .getMany();

    return employees
      .map(e => {
        const currentDossierCount = e.managed_dossiers?.length || 0;
        const maxDossiers = e.max_dossiers || 50;
        const availabilityRate = ((maxDossiers - currentDossierCount) / maxDossiers) * 100;

        return {
          id: e.id,
          name: e.full_name,
          position: e.position,
          specialization: e.specialization,
          branch: e.branch?.name,
          currentDossierCount,
          maxDossiers,
          availabilityRate: Math.round(availabilityRate),
          isAvailable: e.is_available && availabilityRate > 20,
        };
      })
      .filter(e => e.isAvailable)
      .sort((a, b) => b.availabilityRate - a.availabilityRate)
      .slice(0, 20);
  }
}