// src/modules/agencies/employee/services/employee-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeePosition, EmployeeStatus } from './entities/employee.entity';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { Branch } from '../branch/entities/branch.entity';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { EmployeeStatsDto } from './dto/employee-stats.dto';
// src/modules/agencies/employee/services/employee-stats.service.ts

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

  async getStats(filters?: StatsFilterDto): Promise<EmployeeStatsDto> {
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
      this.getEvolution(filters,filters?.fieldToUseForDate, 'employee'),
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
    this.applyFilters(query, filters, 'employee'); ;
    return query.getCount();
  }

  private async getInactiveCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.status = :status', { status: EmployeeStatus.INACTIVE });
    this.applyFilters(query, filters, 'employee'); ;
    return query.getCount();
  }

  private async getOnVacationCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.status = :status', { status: EmployeeStatus.VACATION });
    this.applyFilters(query, filters, 'employee'); ;
    return query.getCount();
  }

  private async getCountByPosition(position: EmployeePosition, filters?: StatsFilterDto): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.position = :position', { position });
    this.applyFilters(query, filters, 'employee'); ;
    return query.getCount();
  }

  private async getDistributionByPosition(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select('employee.position', 'position')
      .addSelect('COUNT(*)', 'count')
      .groupBy('employee.position')
      .orderBy('count', 'DESC');

    this.applyFilters(query, filters, 'employee'); ;

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

    this.applyFilters(query, filters, 'employee'); ;

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

    this.applyFilters(query, filters, 'employee'); ;

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Inconnue',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionBySpecialization(filters?: StatsFilterDto): Promise<any[]> {
    // Cette requête est plus complexe car specialization est un champ texte
    // On va récupérer tous les employés et compter manuellement
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .select(['employee.specialization'])
      .where('employee.specialization IS NOT NULL');

    this.applyFilters(query, filters, 'employee'); ;

    const employees = await query.getMany();
    
    // Compter les spécialisations
    const specializationCount = new Map<string, number>();
    employees.forEach(emp => {
      if (emp.specialization) {
        const specs = emp.specialization.split(',').map(s => s.trim());
        specs.forEach(spec => {
          specializationCount.set(spec, (specializationCount.get(spec) || 0) + 1);
        });
      }
    });

    // Convertir en tableau et trier
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
    // Stats globales
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

    // Stats par poste
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
      averageDossierSuccessRate: 75, // À calculer selon votre logique
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

    this.applyFilters(query, filters, 'employee'); ;

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

    this.applyFilters(query, filters, 'employee'); ;

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

    this.applyFilters(query, filters, 'employee'); ;

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